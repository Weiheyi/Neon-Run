#!/usr/bin/env node
'use strict';

/**
 * 渲染进程冒烟测试：用 Electron 真实加载 index.html，跑一段游戏逻辑，捕获所有报错。
 *
 *   npx electron tools/smoke-test.js .                  # 测试原始源码
 *   npx electron tools/smoke-test.js build-protected    # 测试混淆后的产物
 *
 * 最后一行输出 SMOKE_RESULT {...}，并用退出码表示是否通过。
 */

const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');

const target = path.resolve(process.argv[2] || '.');
const preload = path.join(target, 'preload.js');
const page = path.join(target, 'app', 'index.html');

app.disableHardwareAcceleration();

// 主进程 IPC 桩，让渲染进程的窗口/更新逻辑正常走完
ipcMain.handle('neon:get-version', () => '0.0.0-smoke');
ipcMain.handle('neon:get-window-state', () => ({ fullscreen: false, maximized: false }));
ipcMain.handle('neon:update-check', () => ({ state: 'up-to-date', currentVersion: '0.0.0-smoke', message: 'smoke' }));
ipcMain.handle('neon:update-download', () => ({ state: 'idle' }));
ipcMain.handle('neon:update-install', () => ({ state: 'idle' }));

const errors = [];
let finished = false;

function finish(extra = {}) {
  if (finished) return;
  finished = true;
  const result = { target, errors, ...extra };
  console.log('SMOKE_RESULT ' + JSON.stringify(result));
  app.exit(errors.length ? 1 : 0);
}

const guard = setTimeout(() => finish({ timedOut: true }), 30000);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 3) errors.push('[console] ' + message + ' @' + sourceId + ':' + line);
  });
  win.webContents.on('preload-error', (_e, file, error) => {
    errors.push('[preload] ' + file + ': ' + error.message);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    errors.push('[render-gone] ' + JSON.stringify(details));
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    errors.push('[load-fail] ' + code + ' ' + desc);
  });

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    await win.loadFile(page);
    await sleep(800);

    // 1) 注册一个本地账号并进入主菜单
    await win.webContents.executeJavaScript(`
      (() => {
        document.querySelector('#authRegisterTab').click();
        document.querySelector('#authName').value = 'smoketest';
        document.querySelector('#authPass').value = '1234';
        document.querySelector('#authPass2').value = '1234';
        document.querySelector('#authForm').requestSubmit();
        return true;
      })()
    `);
    await sleep(1200);

    const menuVisible = await win.webContents.executeJavaScript(
      `!document.querySelector('#menu').classList.contains('off')`
    );

    // 2) 开一局，让游戏主循环真的跑起来
    await win.webContents.executeJavaScript(`window.restart && window.restart(); true`);
    await sleep(2000);

    const levelText = await win.webContents.executeJavaScript(
      `document.querySelector('#lv').textContent`
    );

    // 3) 打开几个面板，验证交互逻辑没被混淆破坏
    await win.webContents.executeJavaScript(`
      (() => {
        document.querySelector('#menuShopBtn').click();
        document.querySelector('#menuItemsBtn').click();
        document.querySelector('#menuUpgradeBtn').click();
        document.querySelector('#menuDailyBtn').click();
        return true;
      })()
    `);
    await sleep(600);

    clearTimeout(guard);
    finish({ menuVisible, levelText });
  } catch (error) {
    clearTimeout(guard);
    errors.push('[exception] ' + (error && error.message ? error.message : String(error)));
    finish();
  }
});
