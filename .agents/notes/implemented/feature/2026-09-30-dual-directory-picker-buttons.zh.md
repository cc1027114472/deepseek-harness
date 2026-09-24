# Agent Note: 网页弹窗与系统弹窗双目录选择按钮

Status: implemented

[English](2026-09-30-dual-directory-picker-buttons.md) | 中文

## Problem

在 DeepSeek Harness Web GUI 中，工作区目录选择之前依赖 `directory-picker-auto` 在系统原生文件夹选择弹窗（`-native`）与网页内置弹窗（`-browse`）之间动态单选。由于每次启动只能挂载一套后端及交互界面，用户无法同时使用这两种交互方式。在本地桌面会话中，点击目录按钮会直接弹出系统文件选择窗口，导致用户无法在 Web GUI 内浏览或新建目录；而在远程或无显示会话中，原生系统弹窗又无法使用。用户需要两个独立的按钮，明确区分网页内置弹窗与系统原生弹窗。

## Decision

1. **双能力 browse 后端**：
   在 `@deepseek-ai/dsh-host-directory-picker-browse` 中增加 `pick(signal)` 方法，委托调用 `@deepseek-ai/dsh-host-directory-picker-native` 的 `pickNativeDirectory(signal)`。使 browse 后端成为完整超集，同时支持应用内目录浏览/新建与操作系统原生弹窗唤起。
2. **API 网关能力放行**：
   在 `packages/host/apiproxy/src/api-proxy.ts` 中更新 `host.pickDirectory`，放行定义了 `pick` 方法的 capability（即使 `capability.kind !== 'native'`），确保无缝调用 `capability.pick(signal)`。
3. **侧边栏双按钮呈现**：
   在 `packages/client/ui-workspace/src/client/WorkspaceBrowser.tsx` 中，将原单一工作区选择按钮拆分为并排的两个操作按钮：
   - **网页选择目录按钮**（`IconBrowseOutline16`）：触发 `WorkspacePickFlow`，弹出应用内 `DirectoryBrowser` 模态对话框，支持多层级目录浏览与新建文件夹。
   - **系统窗口选择按钮**（`IconProjectAddOutline16`）：直接调用 `ctx.workspaces.pickDirectory()`，调起操作系统原生文件夹选择器。选中后自动创建工作区并启动会话；取消时静默关闭；失败时通过独立弹窗展示错误。

## Alternatives considered

- **单个按钮弹出下拉菜单**：
  在单个添加按钮上提供包含“打开系统窗口”和“打开网页浏览”的下拉菜单，会为每次选择增加一次多余的点击操作。在头部操作区直接提供两个独立图标按钮配合明确 Tooltip，操作更加直接高效。
- **同时挂载 native 与 browse 插件**：
  Cordis 禁止相同服务标识（`directoryPicker`）注册多个服务，否则会抛出 duplicate-service 错误。此外，`sidebar.workspaces.directoryFlow` 是单占位 slot。扩展 browse 后端委托 `pick` 既保持了单占位 slot 的纯净性，又实现了完备的双能力支持。

## Consequences

- 用户可以在侧边栏头部直接自主选择使用网页内置弹窗还是操作系统原生弹窗。
- 两种方式在用户确认选择后均能正常创建工作区并激活会话。
- 无图形界面或无原生 chooser 二进制的环境下，网页内置弹窗依然能正常运作，原生调用失败时会通过专用错误弹窗友好提示。
