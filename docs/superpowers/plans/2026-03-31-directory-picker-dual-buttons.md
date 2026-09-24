# 双按钮工作区目录选择器实施计划 (Dual Directory Picker Buttons Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将工作区目录选择功能拆分为两个独立按钮：一个点击打开网页弹窗（应用内浏览选择），一个点击打开系统窗口（Windows 原生选择器）。

**Architecture:**
- 后端：在 `directory-picker-browse` 服务能力中补充 `pick(signal)`，并在 `apiproxy.ts` 中支持具备 `pick` 方法的 picker 直接调用 `pickNativeDirectory`，实现同一运行时同时支持 Browse 与 Native 两套能力。
- 前端：在 `ui-workspace` 注入 `pickDirectory` RPC 方法，侧边栏头部增加并排两个独立图标按钮：`IconBrowseOutline16`（网页弹窗）与 `IconProjectAddOutline16`（系统弹窗），分别触发对应的逻辑。

**Tech Stack:** TypeScript, React, Cordis, DeepSeek Harness Client/Host Plugins.

---

### Task 1: 后端支持：在 `directory-picker-browse` 中补充 `pick(signal)`
**Files:**
- Modify: `packages/host/directory-picker-browse/src/index.ts`
- Modify: `packages/host/directory-picker/src/index.ts`

- [x] **Step 1: 在 `DirectoryPickerBrowseCapability` 类型中允许可选的 `pick` 方法**
- [x] **Step 2: 在 `BrowseDirectoryPicker` 中引入并绑定 `pickNativeDirectory`**
- [x] **Step 3: 运行目录选择器单元测试验证**

---

### Task 2: 后端放行：在 `api-proxy.ts` 中放行带 `pick` 方法的 picker
**Files:**
- Modify: `packages/host/apiproxy/src/api-proxy.ts`

- [x] **Step 1: 在 `api.host.pickDirectory` 中检查 `if (capability.kind !== 'native' && !('pick' in capability))`**
- [x] **Step 2: 当 `'pick' in capability` 时调用 `capability.pick(signal)`**

---

### Task 3: 多语言配置：添加双按钮文案
**Files:**
- Modify: `packages/client/ui-workspace/src/client/locales.ts`

- [x] **Step 1: 在 `zh` 和 `en` 字典中添加 `workspace.addBrowse` 和 `workspace.addNative`**

---

### Task 4: 前端注入：在 `ui-workspace` 中注入 `pickDirectory`
**Files:**
- Modify: `packages/client/ui-workspace/src/client/contract/slots.ts`
- Modify: `packages/client/ui-workspace/src/client/index.ts`

- [x] **Step 1: 在 `WorkspaceBrowserInjected` 接口中声明 `pickDirectory?: () => Promise<string | null>`**
- [x] **Step 2: 在 `browserInjected` 中注入 `pickDirectory: () => ctx.workspaces.pickDirectory()`**

---

### Task 5: 界面拆分：在 `WorkspaceBrowser.tsx` 中渲染双按钮
**Files:**
- Modify: `packages/client/ui-workspace/src/client/WorkspaceBrowser.tsx`

- [x] **Step 1: 引入 `IconBrowseOutline16`**
- [x] **Step 2: 编写原生系统选择处理函数 `handleNativePick`**
- [x] **Step 3: 在侧边栏 actions 区域并排渲染【网页选择目录】和【系统窗口选择】两个按钮**

---

### Task 6: 构建构建物并重启验证
- [x] **Step 1: 执行 `pnpm --filter @deepseek-ai/dsh-client-ui-workspace bundle` 重新打包**
- [x] **Step 2: 执行 `pnpm --filter @deepseek-ai/dsh-host-directory-picker-browse build`**
- [x] **Step 3: 验证界面与功能**
