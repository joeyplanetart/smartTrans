# smartTrans

Bun + Electron 桌面翻译工具。只支持中文和英文，在一个内容面板里编辑、翻译、插入或替换。翻译由本机已登录的 Codex CLI 或 Cursor CLI 完成，无需在应用里填写 API Key。

## 运行

    bun install
    bun run start

## macOS 图标启动

已安装的版本位于 `/Applications/smartTrans.app`，可从 Finder 的「应用程序」中双击打开，也可以将它拖到 Dock。

重新打包：

    bun run package:mac

产物为 `dist/smartTrans.app`，自带 Electron 运行环境。将它复制到「应用程序」即可安装。该包使用本机临时签名，适合本机使用；对外分发需要 Apple Developer 签名和公证。翻译仍需要本机安装并登录 CLI。

图标源文件为 `scripts/make-icon.swift`，应用图标为 `assets/smartTrans.icns`。

需要预先安装并登录至少一个命令行工具：

- Codex CLI：运行 `codex login`
- Cursor CLI：运行 `agent login`

可在应用右上角「设置」中切换工具。若从 Finder 启动 Electron，应用也会查找常见的 CLI 安装路径。

本项目显式选择适合简单翻译的低成本模型：

- Codex CLI：`gpt-6-luna`，`model_reasoning_effort="low"`。
- Cursor CLI：`claude-haiku-5-5-low`，不启用思考。

这些参数只用于本应用的翻译请求。模型不可用时会报错，不会自动切换到更贵的模型。实际扣费或额度消耗以对应账号套餐为准。

## 使用

输入或粘贴中文、英文内容。选中文本时只翻译选区；不选中时翻译全文。目标语言会自动判断，也可手动切换。译文出来后可插入原文后、替换原文，或复制。

- 逐步显示译文，显示引擎就绪、首字和总耗时，生成中可以取消。格式校验完成后才允许应用译文。
- Codex 使用本机 CLI 的 app-server 流式接口，复用后台进程；每次翻译使用独立临时会话。Cursor 使用 stream-json 增量输出。
- 最近 30 条相同内容、目标语言和模型的译文缓存在本次进程内；退出后清除，取消或校验失败的结果不会缓存。
- 代码块、行内代码、链接地址、标题与列表标记、换行等会先被保护，再逐一校验、还原；校验失败时保留原文。
- 按中文字符和英文词的占比识别主要语言，并显示混排提示；可手动覆盖翻译方向。
- 插入、替换和剪贴板导入各作为独立编辑步骤，支持撤销与重做；修改后提供直接撤销按钮。
- 菜单栏「译」可打开窗口、翻译剪贴板或退出。关闭窗口时应用留在菜单栏。
- 剪贴板翻译会将文字追加到现有内容后，选中新增部分进行翻译；可撤销追加操作。

快捷键：

- `⌘/Ctrl + Enter`：翻译
- `⌘/Ctrl + Shift + Enter`：替换原文
- `Alt + Enter`：插入译文
- `Esc`：取消当前翻译或关闭译文
- `⌘/Ctrl + Z` / `⌘/Ctrl + Shift + Z`：撤销 / 重做
- `⌘/Ctrl + Shift + T`：全局唤起窗口
- `⌘/Ctrl + Shift + Y`：全局翻译剪贴板

设置中可查看全局快捷键是否注册成功；若组合被其他软件占用，可使用应用的「翻译」菜单或菜单栏「译」操作。

运行 `bun test` 验证 Markdown 保护、撤销历史和语言识别；运行 `bun run check` 检查脚本语法。

内容保存在当前设备的应用本地存储。翻译会发送到所选 CLI 对应的 AI 服务；CLI 运行在只读模式，以避免翻译文本触发文件修改。
