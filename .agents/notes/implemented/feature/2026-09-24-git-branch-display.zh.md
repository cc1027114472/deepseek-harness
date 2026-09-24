# Agent Note: 对话框上方与会话顶部常驻展示 Git 分支

Status: implemented

[English](2026-09-24-git-branch-display.md) | 中文

## 问题

开发者在 Web 客户端交互时需要经常查看当前工作区所处的 Git 分支。此前界面在对话框与会话视图中均无任何分支指示，用户不得不频繁切换到外部终端执行 `git branch`，在多分支开发与多工作区切换时造成了不便与心智负担。

## 决策

1. **原生零子进程的后端接口 `/api/git-branch`**：
   在 `packages/client/connection/src/index.ts` 中注册 `exact` 路由 `/api/git-branch`。通过 Node.js 原生文件系统纯函数（`resolveGitBranch`）直接解析目标工作区目录的 `.git/HEAD`，支持子目录向上溯源、worktree 及分离 HEAD，耗时小于 1ms，且彻底避免了在 Windows 平台调用子进程可能引发的权限阻断（`EPERM`）。
2. **专属 `GitBranchChip` 展示组件**：
   在 `packages/client/ui-conversation/src/client/skeleton/GitBranchChip.tsx` 中实现该胶囊组件，采用 `@deepseek-ai/dsh-client-ui-primitives` 内置的 `IconBranchOutline16` 分支图标，与 `WorkspaceChip` 及 `AgentPresetSeat` 保持统一的 28px 圆角胶囊微光风格。支持点击重新探测，外部终端切分支后无需全页刷新即可一键同步。
3. **两处核心界面常驻挂载**：
   - **Hero 区域输入框上方**：位于 `ConversationRoot` 的 `heroWorkspaceRow`，紧随 `conversation.hero.agentPreset`（PTC 模式）右侧。
   - **活跃会话顶部导航栏**：挂载于 `ConversationSessionHeader` 的 `headerActions` 中，使得进入会话后也能一眼看到当前分支。

## 考虑过的备选方案

- **通过命令行子进程执行 `git branch --show-current`**：
  在 Windows 上拉起子进程耗时较长（约 100–300ms），且在沙箱限制环境下可能遭遇进程派发异常。直接读取 `.git/HEAD` 速度高两个数量级且极其稳健。
- **直接在 `WorkspaceView` 协议中增加 `gitBranch` 字段**：
  这需要改动底层持久化存储模式及 apiproxy 协议。由于 Git 分支属于动态易变的宿主即时状态，并非持久化业务实体，采用按需查询的轻量 HTTP 接口更符合关注点分离原则。

## 影响

- 新建会话界面与会话聊天中均固定展示当前 Git 分支。
- 用户可随时点击分支胶囊重新采样最新状态。
- 非 Git 仓库目录静默不展示芯片，不破坏原有布局与体验。
