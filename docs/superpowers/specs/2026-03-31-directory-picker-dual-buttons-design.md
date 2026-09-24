# 双按钮工作区目录选择器设计规范 (Dual Directory Picker Buttons)

## 1. 背景与目标
在 DeepSeek Harness Web GUI 中，原有的工作区目录选择器依赖 `directory-picker-auto` 在系统原生对话框（Windows IFileOpenDialog）与应用内网页对话框（DirectoryBrowser Modal）之间进行自适应单选。用户希望在界面上将这两个功能彻底拆分为两个独立的直接操作按钮：
1. **网页弹窗选择**：在网页内弹出目录浏览与新建对话框（图 2 样式），适合在浏览器内直接点选与创建文件夹；
2. **系统窗口选择**：直接唤起 Windows 操作系统的原生文件夹选择窗口（图 1 样式），符合桌面操作系统习惯。

## 2. 界面与交互设计 (UI & Frontend)
- **位置**：侧边栏（`sidebar.workspaces`）头部操作区（`actions`）。
- **控件布局**：
  1. **网页选择目录按钮**：
     - 图标：`IconBrowseOutline16`
     - Tooltip：`网页选择目录` (`t('workspace.addBrowse')`)
     - 行为：点击触发 `WorkspacePickFlow`，弹出网页内置的 `DirectoryBrowser` Modal 弹窗，支持按层级点选、新建文件夹、点击打开完成工作区导入。
  2. **系统窗口选择按钮**：
     - 图标：`IconProjectAddOutline16`
     - Tooltip：`系统窗口选择` (`t('workspace.addNative')`)
     - 行为：点击直接调用 `ctx.workspaces.pickDirectory()` 调起 Windows 本地文件选择窗口；用户确认选中后自动调用 `createWorkspace({ path })` 并激活会话；用户取消则静默关闭。

## 3. 后端服务与双能力支撑 (Backend & Host)
- **问题分析**：
  原 `ctx.directoryPicker` 只能是 `native` 或 `browse` 其中之一。当是 `native` 时，调用 `listDirectory` 会报错；当是 `browse` 时，调用 `pickDirectory` 会报错。
- **解法**：
  1. 在 `packages/host/directory-picker-browse` 的服务能力中补充 `pick(signal)` 实现，直接调用 `pickNativeDirectory(signal)`（跨平台支持 Win32/macOS 等）。
  2. 在 `packages/host/apiproxy/src/api-proxy.ts` 中，放行具备 `pick` 方法的 capability，使其不再受限于仅 `native`，同时保留 `listDirectory` 和 `createDirectory`。
  3. 在 `directory-picker-auto` 中，当环境支持或统一使用具备双重能力（Dual / Browse+Native）的后端时，使两者在 127.0.0.1 及局域网访问下皆可同时使用。

## 4. 验证方式
1. 单元测试覆盖各变更点；
2. 执行 Client UI Bundle 编译构建；
3. 验证 3080 / 3090 端口下的 Web 界面：两个按钮均可正常点击并分别触发对应弹窗。
