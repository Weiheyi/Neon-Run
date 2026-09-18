# 自动更新说明

当前版本从以下 GitHub Release 检查更新：

```text
https://api.github.com/repos/wuhaoyang1126-code/Project1/releases/latest
```

## 发布新版本

1. 修改 `package.json` 中的 `version`。
2. 执行：

```bash
npm run dist
```

3. 在 GitHub 创建与版本一致的标签和 Release，例如：

```text
v1.8.0
```

4. 上传 `dist/` 中的 Windows portable EXE。文件名必须包含 `portable.exe`，例如：

```text
霓虹跑酷-1.8.0-portable.exe
```

## 更新流程

- 游戏启动后会自动检查 GitHub 最新 Release。
- 打包后的 Windows 版本发现新版本时会自动下载。
- 设置面板可查看下载状态，完成后点击“重启并更新”。
- 更新程序会等待当前游戏退出，替换 portable EXE，然后重新启动游戏。
- macOS 版本会下载 DMG 并打开安装包，由用户完成安装。

## 代码防护

发布出去的代码都经过混淆，安装包和网页版里不会出现明文源码。

- `npm run protect`：把 `app/` 下的前端代码与 `main.js` / `preload.js` 混淆，输出到 `build-protected/`（该目录已加入 `.gitignore`）。
- `npm run dist`、`npm run dist:mac`、`build-mac.sh`、以及 GitHub Actions 构建/部署流程都会自动先执行 `protect`，打包和部署只读取 `build-protected/`。
- 打包后的程序关闭了开发者工具（F12 / Ctrl+Shift+I / Ctrl+U 等快捷键与右键菜单都被拦截），并移除 `--remote-debugging-port`、`--inspect` 等远程调试开关。
- `npm run smoke`：用 Electron 真实加载混淆后的产物跑一遍游戏流程，用来确认混淆没破坏功能。
- 开发调试照常 `npm start`，跑的是未混淆的源码。

> 改游戏代码请照常编辑 `app/` 下的文件，不要直接改 `build-protected/`——它每次构建都会重新生成。
