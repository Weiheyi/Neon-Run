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
