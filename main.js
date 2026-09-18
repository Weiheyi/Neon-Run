const { app, BrowserWindow, Menu, globalShortcut, ipcMain, screen, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

let win = null;
const UPDATE_REPO = 'wuhaoyang1126-code/Project1';
const UPDATE_API_URL = process.env.NEONRUN_UPDATE_API_URL || `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;

// 打包后禁止通过命令行开关挂载远程调试器（CDP 可直接读取全部源码）
if (app.isPackaged) {
  ['remote-debugging-port', 'remote-debugging-pipe', 'inspect', 'inspect-brk'].forEach(name => {
    if (app.commandLine.hasSwitch(name)) app.commandLine.removeSwitch(name);
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
let updateState = {
  state: 'idle',
  currentVersion: app.getVersion(),
  latestVersion: null,
  progress: 0,
  message: ''
};
let latestRelease = null;
let updateCheckPromise = null;

function sendUpdateState(next = {}) {
  updateState = { ...updateState, ...next, currentVersion: app.getVersion() };
  if (win && !win.isDestroyed()) win.webContents.send('neon:update-state', updateState);
  return updateState;
}

function requestJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const client = target.protocol === 'http:' ? http : https;
    const req = client.get(target, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'NeonRun-Updater'
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects >= 5) return reject(new Error('更新地址重定向过多'));
        return resolve(requestJson(new URL(res.headers.location, target).href, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        const error = new Error(`更新服务返回 HTTP ${res.statusCode}`);
        error.statusCode = res.statusCode;
        return reject(error);
      }
      const chunks = [];
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) req.destroy(new Error('更新信息过大'));
        else chunks.push(chunk);
      });
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new Error('更新信息格式错误')); }
      });
    });
    req.setTimeout(15000, () => req.destroy(new Error('检查更新超时')));
    req.on('error', reject);
  });
}

function compareVersions(left, right) {
  const parse = value => String(value || '').replace(/^v/i, '').split('-')[0].split('.').map(part => parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function selectReleaseAsset(release) {
  const assets = Array.isArray(release && release.assets) ? release.assets : [];
  if (process.platform === 'win32') {
    return assets.find(asset => /portable\.exe$/i.test(asset.name)) || assets.find(asset => /\.exe$/i.test(asset)) || null;
  }
  if (process.platform === 'darwin') {
    return assets.find(asset => /\.dmg$/i.test(asset.name)) || assets.find(asset => /\.zip$/i.test(asset.name)) || null;
  }
  return assets.find(asset => /\.(appimage|deb|rpm)$/i.test(asset.name)) || null;
}

async function checkForUpdates(options = {}) {
  if (updateCheckPromise) return updateCheckPromise;
  sendUpdateState({ state: 'checking', message: '正在检查更新', progress: 0 });
  updateCheckPromise = (async () => {
    try {
      const release = await requestJson(UPDATE_API_URL);
      latestRelease = release;
      const latestVersion = String(release.tag_name || release.name || '').replace(/^v/i, '');
      if (!latestVersion) return sendUpdateState({ state: 'error', message: '更新信息缺少版本号' });
      if (compareVersions(latestVersion, app.getVersion()) <= 0) {
        return sendUpdateState({ state: 'up-to-date', latestVersion, message: '当前已是最新版本' });
      }
      const asset = selectReleaseAsset(release);
      if (!asset) return sendUpdateState({ state: 'error', latestVersion, message: '新版本没有可用的安装包' });
      const state = sendUpdateState({
        state: 'available',
        latestVersion,
        message: `发现新版本 v${latestVersion}`,
        assetName: asset.name,
        assetUrl: asset.browser_download_url
      });
      if (options.auto && app.isPackaged) setTimeout(() => downloadUpdate().catch(() => {}), 0);
      return state;
    } catch (error) {
      const message = error.statusCode === 404 ? '尚未发布可用更新' : (error.message || '检查更新失败');
      return sendUpdateState({ state: error.statusCode === 404 ? 'no-release' : 'error', message });
    } finally {
      updateCheckPromise = null;
    }
  })();
  return updateCheckPromise;
}

function downloadUpdate() {
  if (updateState.state === 'downloading') return Promise.resolve(updateState);
  if (updateState.state !== 'available' || !updateState.assetUrl) return Promise.resolve(updateState);
  const targetDir = path.join(app.getPath('temp'), 'NeonRunUpdates');
  const safeName = path.basename(updateState.assetName || 'NeonRun-update.exe');
  const targetPath = path.join(targetDir, safeName);
  const partPath = targetPath + '.part';
  fs.mkdirSync(targetDir, { recursive: true });
  sendUpdateState({ state: 'downloading', progress: 0, message: '正在下载更新' });
  return new Promise((resolve, reject) => {
    const request = url => {
      const target = new URL(url);
      const client = target.protocol === 'http:' ? http : https;
      const req = client.get(target, { headers: { 'User-Agent': 'NeonRun-Updater' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return request(new URL(res.headers.location, target).href);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`下载更新失败：HTTP ${res.statusCode}`));
        }
        const total = Number(res.headers['content-length']) || 0;
        let received = 0;
        let lastProgress = -1;
        const file = fs.createWriteStream(partPath);
        res.on('data', chunk => {
          received += chunk.length;
          const progress = total ? Math.floor(received * 100 / total) : 0;
          if (progress !== lastProgress) {
            lastProgress = progress;
            sendUpdateState({ state: 'downloading', progress, message: total ? `正在下载更新 ${progress}%` : '正在下载更新' });
          }
        });
        res.pipe(file);
        file.on('finish', () => file.close(() => {
          try {
            fs.renameSync(partPath, targetPath);
            resolve(sendUpdateState({ state: 'downloaded', progress: 100, filePath: targetPath, message: '更新已下载，重启后安装' }));
          } catch (error) {
            reject(error);
          }
        }));
        file.on('error', reject);
      });
      req.setTimeout(30000, () => req.destroy(new Error('下载更新超时')));
      req.on('error', reject);
    };
    request(updateState.assetUrl);
  }).catch(error => sendUpdateState({ state: 'error', message: error.message || '下载更新失败' }));
}

function installUpdate() {
  if (!app.isPackaged) return Promise.resolve(sendUpdateState({ state: 'error', message: '开发模式不能自动替换程序' }));
  if (updateState.state !== 'downloaded' || !updateState.filePath || !fs.existsSync(updateState.filePath)) {
    return Promise.resolve(sendUpdateState({ state: 'error', message: '更新文件不存在，请重新检查更新' }));
  }
  if (process.platform !== 'win32') {
    shell.openPath(updateState.filePath);
    sendUpdateState({ state: 'manual', progress: 100, message: '安装包已打开，请按提示完成更新' });
    return Promise.resolve(updateState);
  }
  const currentExe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  if (!currentExe || !fs.existsSync(currentExe)) {
    return Promise.resolve(sendUpdateState({ state: 'error', message: '无法定位当前程序文件' }));
  }
  const quote = value => "'" + String(value).replace(/'/g, "''") + "'";
  const script = [
    `$pidToWait = ${process.pid}`,
    'while (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 300 }',
    `Copy-Item -LiteralPath ${quote(updateState.filePath)} -Destination ${quote(currentExe)} -Force`,
    `Start-Process -FilePath ${quote(currentExe)}`
  ].join('; ');
  const helper = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  helper.unref();
  sendUpdateState({ state: 'installing', progress: 100, message: '正在重启并安装更新' });
  setTimeout(() => app.quit(), 300);
  return Promise.resolve(updateState);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: '#08051b',
    autoHideMenuBar: true,
    title: '霓虹跑酷',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // 打包后关闭开发者工具：防止通过 DevTools 直接读取源码
      devTools: !app.isPackaged,
    },
  });

  // 移除默认菜单，避免 Alt 弹出菜单干扰游戏
  Menu.setApplicationMenu(null);
  win.removeMenu();
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-finish-load', () => {
    sendUpdateState();
    setTimeout(() => checkForUpdates({ auto: true }).catch(() => {}), 1200);
  });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = String(input.key || '').toLowerCase();
    const ctrl = input.control || input.meta;
    // 刷新 / 全屏 / 开发者工具类快捷键一律拦截
    if (['F5', 'F11', 'F12'].includes(input.key)) { event.preventDefault(); return; }
    if (ctrl && !input.shift && ['r', 'u', 'p', 's', 'o'].includes(key)) { event.preventDefault(); return; }
    if (ctrl && input.shift && ['i', 'j', 'c', 'k', 'e'].includes(key)) { event.preventDefault(); return; }
    // 允许方向键/空格正常传给页面
  });

  // 窗口状态变化（全屏/最大化）推送给渲染进程，设置面板同步显示
  const pushState = () => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('neon:window-state', {
        fullscreen: win.isFullScreen(),
        maximized: win.isMaximized(),
      });
    }
  };
  win.on('enter-full-screen', pushState);
  win.on('leave-full-screen', pushState);
  win.on('maximize', pushState);
  win.on('unmaximize', pushState);
  win.on('resize', pushState);
  win.on('closed', () => { win = null; });

  return win;
}

// 窗口控制 IPC：渲染进程设置面板调用
ipcMain.on('neon:set-window', (event, opts) => {
  if (!win || win.isDestroyed()) return;
  if (opts && typeof opts === 'object') {
    if (opts.fullscreen === true) {
      win.setFullScreen(true);
    } else if (opts.fullscreen === false) {
      win.setFullScreen(false);
    }
    if (Number.isFinite(opts.width) && Number.isFinite(opts.height)) {
      win.setSize(Math.round(opts.width), Math.round(opts.height));
      // 缩放后确保窗口居中
      const wa = screen.getPrimaryDisplay().workArea;
      win.setPosition(
        wa.x + Math.round((wa.width - opts.width) / 2),
        wa.y + Math.round((wa.height - opts.height) / 2)
      );
    }
  }
});

ipcMain.handle('neon:get-window-state', () => {
  if (!win || win.isDestroyed()) return { fullscreen: false, maximized: false };
  return {
    fullscreen: win.isFullScreen(),
    maximized: win.isMaximized(),
  };
});

ipcMain.on('neon:minimize-window', () => {
  if (win && !win.isDestroyed()) win.minimize();
});

ipcMain.on('neon:maximize-window', () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.on('neon:close-window', () => {
  if (win && !win.isDestroyed()) win.close();
});

ipcMain.handle('neon:get-version', () => app.getVersion());
ipcMain.handle('neon:update-check', () => checkForUpdates());
ipcMain.handle('neon:update-download', () => downloadUpdate());
ipcMain.handle('neon:update-install', () => installUpdate());

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
  app.setAppUserModelId('com.neonrun.pc');
  const w = createWindow();
  w.webContents.on('context-menu', () => {});
  w.webContents.on('will-navigate', (e) => e.preventDefault());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

app.on('window-all-closed', () => {
  app.quit();   // 游戏应用：关闭窗口即退出（macOS 同样）
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
