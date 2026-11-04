# smartTrans

Bun + Electron 桌面翻译工具。只支持中文和英文，在一个内容面板里编辑、翻译、插入或替换。翻译由本机已登录的 Codex CLI 或 Cursor CLI 完成，无需在应用里填写 API Key。

## 运行

    bun install
    bun run start

需要预先安装并登录至少一个命令行工具：

- Codex CLI：运行 `codex login`
- Cursor CLI：运行 `agent login`

可在应用右上角「设置」中切换工具。若从 Finder 启动 Electron，应用也会查找常见的 CLI 安装路径。

## 使用

输入或粘贴中文、英文内容。选中文本时只翻译选区；不选中时翻译全文。目标语言会自动判断，也可手动切换。译文出来后可插入原文后、替换原文，或复制。

快捷键：

- `⌘/Ctrl + Enter`：翻译
- `⌘/Ctrl + Shift + Enter`：替换原文
- `Alt + Enter`：插入译文
- `Esc`：关闭译文

内容保存在当前设备的应用本地存储。翻译会发送到所选 CLI 对应的 AI 服务；CLI 运行在只读模式，以避免翻译文本触发文件修改。
