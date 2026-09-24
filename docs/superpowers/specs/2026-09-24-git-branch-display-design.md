# Git 分支常驻展示设计规范

## 1. 需求与背景
用户在日常交互中需要频繁查看当前项目所在的 Git 分支。由于缺乏直观的展示位置，需手动切换到终端执行 `git branch`，效率较低。
用户希望在主界面对话框上方（Hero 区域，即工作区选择器和 PTC 模式右侧的空位）以及会话对话中，固定并常驻展示当前工作区所在的 Git 分支。

## 2. 界面设计与交互

### 2.1 Hero 区域（新建会话 / 空白对话态）
- **位置**：位于 `ConversationRoot` 中的 `heroWorkspaceRow`，紧随 `conversation.hero.agentPreset`（PTC 模式）之后。
- **视觉风格**：
  - 与 `WorkspaceChip` 和 `AgentPresetSeat` 保持一致的圆角胶囊风格（height 28px, border-radius 16px, font-size 13px）。
  - 图标：使用系统内置的 `IconBranchOutline16` 分支图标。
  - 文案：展示当前分支名（如 `mowan` 或 `master`），超长时通过 ellipsis 截断。
  - 悬停：背景轻量高亮（`var(--dsw-alias-interactive-bg-hover)`），鼠标指针为 pointer。
  - Tooltip：提示 `当前 Git 分支: <branch> (点击刷新)`。
  - 交互：支持点击刷新。用户在终端使用 git 切换分支后，点击 Chip 可以无感知地重新采样最新分支。

### 2.2 会话顶部导航（活跃对话态）
- **位置**：位于 `ConversationSessionHeader` 的 `headerActions` 区域（紧随会话祖先面包屑之后）。
- **表现**：同为轻量分支 Chip，保持视觉与状态同步。

## 3. 技术实现与架构

### 3.1 后端接口：`/api/git-branch`
- **挂载点**：在 `packages/client/connection/src/index.ts` 中注册 `exact` 路由 `/api/git-branch`。
- **实现原理**：
  - 由 Node.js 后端直接读取传入工作区目录（或宿主 `process.cwd()`）的 `.git/HEAD` 文件。
  - 支持普通 `.git` 目录、子目录向上递归查找、以及 worktree / submodule 的 `gitdir: <path>` 引用。
  - 纯原生文件系统读取，耗时小于 1ms，不依赖外部进程或子进程 spawn（避免 Windows 权限/EPERM 异常与资源浪费）。
  - 返回 JSON：`{ branch: string | null }`。

### 3.2 前端组件：`GitBranchChip`
- **文件路径**：`packages/client/ui-conversation/src/client/skeleton/GitBranchChip.tsx`
- **样式定义**：`packages/client/ui-conversation/src/client/skeleton/HeroShell.module.css`
- **依赖**：`@deepseek-ai/dsh-client-ui-primitives` 中的 `IconBranchOutline16`。
- **逻辑**：根据传入的 `cwd`（或当前工作区路径）发起查询；当非 Git 仓库或检测失败时静默隐藏，不破坏页面整洁度。

## 4. 验证计划
1. 单元测试/逻辑验证：通过 Node 运行验证各种路径下的 `.git` 分支解析。
2. 界面展示验证：在 `0.0.0.0:3090` 和 `127.0.0.1:3080` 验证 Hero 区域与会话 Header 区域的分支芯片渲染。
3. 交互验证：验证点击刷新逻辑及悬停样式。
