# Git 分支常驻展示实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在界面对话框上方（新建会话 Hero 区域红框位置）以及活跃会话顶部导航栏中，固定并常驻展示当前工作区所在的 Git 分支，并支持点击无感刷新。

**Architecture:**
1. 后端在 `packages/client/connection` 注册 `/api/git-branch` 接口，通过原生 fs 纯文件方式（毫秒级、0子进程、无权限报错）解析指定目录或当前工作区的 `.git/HEAD` 获取分支名。
2. 前端在 `packages/client/ui-conversation` 中提供 `GitBranchChip` 组件，使用系统内置 `IconBranchOutline16` 图标，在 `ConversationRoot` 的 `heroWorkspaceRow` 以及 `ConversationSessionHeader` 中挂载展示。

**Tech Stack:** React 19, TypeScript, Node.js fs, CSS Modules, Cordis

---

### Task 1: 实现后端 Git 分支解析与路由

**Files:**
- Create: `packages/client/connection/src/git-branch.ts`
- Modify: `packages/client/connection/src/index.ts`

- [ ] **Step 1: 编写 `git-branch.ts` 工具函数**
提供支持递归向上查找 `.git` 目录、worktree 引用以及提取 HEAD 的纯函数 `resolveGitBranch(startDir?: string): string | null`。

- [ ] **Step 2: 验证工具函数逻辑**
使用 `node --experimental-strip-types` 运行测试脚本，确认能准确解析当前仓库分支 `mowan`。

- [ ] **Step 3: 在 `client-connection` 插件中注册 `/api/git-branch`**
在 `packages/client/connection/src/index.ts` 中注册 `exact` 路由，支持 GET/POST 请求获取 `{ branch }`。

- [ ] **Step 4: 验证接口返回**
通过本地请求测试 `/api/git-branch` 接口。

---

### Task 2: 实现前端 `GitBranchChip` 组件与样式

**Files:**
- Create: `packages/client/ui-conversation/src/client/skeleton/GitBranchChip.tsx`
- Modify: `packages/client/ui-conversation/src/client/skeleton/HeroShell.module.css`

- [ ] **Step 1: 在 `HeroShell.module.css` 添加芯片样式**
定义 `.gitBranchChip`、`.gitBranchLoading`、`.branchIcon`、`.branchLabel`，与 `.workspace` 保持一致的圆角胶囊与悬停微光风格。

- [ ] **Step 2: 编写 `GitBranchChip.tsx`**
实现带加载状态、点击手动刷新、防抖与请求缓存的 React 组件，使用 `IconBranchOutline16` 图标。

---

### Task 3: 在 Hero 区域和会话 Header 区域挂载组件

**Files:**
- Modify: `packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx`
- Modify: `packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx`

- [ ] **Step 1: 在 `ConversationRoot.tsx` 的 `heroWorkspaceRow` 挂载 `GitBranchChip`**
置于 `conversation.hero.agentPreset` 右侧（即用户截图标红框的位置）。

- [ ] **Step 2: 在 `ConversationSession.tsx` 的 `ConversationSessionHeader` 挂载 `GitBranchChip`**
置于 `headerActions` 中，使得进入会话后也能在顶部查看到当前分支。

---

### Task 4: 更新目录选择器文档并重启验证

**Files:**
- Modify: `packages/host/directory-picker-auto/README.md`
- Modify: `packages/host/directory-picker-auto/README.zh.md`

- [ ] **Step 1: 同步更新目录选择器文档**
将 Scenario A（macOS/Windows 桌面无视 bind host 一律原生，非桌面/远程走浏览）的决策说明同步至中英文 README。

- [ ] **Step 2: 重启服务并做综合验证**
通过重启脚本或验证端点，确保新功能与目录选择器修改完整生效。
