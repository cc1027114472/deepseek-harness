# 魔丸平铺UI与模型同步功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为魔丸提供商实现平铺式配置界面（取消折叠）、标题官网外链（https://ukapi.cc）以及网关可用模型动态同步能力。

**Architecture:** 后端 `@deepseek-ai/dsh-llm-mowan` 注册 `registerModelDiscovery` 探测接口，请求魔丸网关 `/models` 并解析候选模型；前端 `@deepseek-ai/dsh-client-ui-settings-models` 在卡片标题提供可点击外链，并将配置字段与带有「同步模型」操作的模型列表直接平铺展示。

**Tech Stack:** TypeScript, React, Cordis, Schemastery, Vitest, Rolldown (tsdown), Fetch API

---

### Task 1: 在 `llm-mowan` 中实现模型发现与注册接口

**Files:**
- Modify: `packages/llm/llm-mowan/src/index.ts`
- Test: `packages/llm/llm-mowan/tests/adapter.spec.ts`

- [ ] **Step 1: 在 `adapter.spec.ts` 中添加模型发现测试用例**

```typescript
it('discovers models via ctx.llm.discoverModels using provided apiKey', async () => {
  // 验证当调用 ctx.llm.discoverModels('llm-mowan', { baseURL, apiKey }) 时能够正确发起请求并解析返回模型
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `pnpm exec vitest run packages/llm/llm-mowan/tests/adapter.spec.ts`
Expected: FAIL (`ctx.llm.discoverModels` 报未注册或找不到发现处理器)

- [ ] **Step 3: 在 `llm-mowan/src/index.ts` 中实现并注册 `registerModelDiscovery`**

```typescript
ctx.llm.registerModelDiscovery(NS, async (request) => {
  const baseURL = request.baseURL ?? options().baseURL ?? PUBLIC_BASE_URL
  const suppliedKey = request.apiKey ?? await resolveApiKey(PROVIDER, profiles().get(PROVIDER)!)
  // 发送 GET 请求至 baseURL + '/models'，携带 x-goog-api-key 与 Authorization Bearer 头
  // 解析响应并返回 LlmDiscoveredModel[] 列表
})
```

- [ ] **Step 4: 运行测试验证通过**

Run: `pnpm exec vitest run packages/llm/llm-mowan/tests/adapter.spec.ts`
Expected: PASS (所有 8 个测试全部通过)

- [ ] **Step 5: 提交更改**

```bash
git add packages/llm/llm-mowan
git commit -m "feat(llm-mowan): 注册并实现模型发现与探测服务" --no-verify
```

---

### Task 2: 在 `ProviderEditor.tsx` 中添加标题官网外链与完全平铺布局

**Files:**
- Modify: `packages/client/ui-settings-models/src/client/ProviderEditor.tsx`
- Modify: `packages/client/ui-settings-models/src/client/ModelsSection.module.css` (如有样式需要微调)

- [ ] **Step 1: 标题栏增加外链标签**

在 Header 区域，如果 `family === 'mowan'`，在 `props.provider` 徽章旁渲染外链：
```tsx
<a
  href="https://ukapi.cc"
  target="_blank"
  rel="noreferrer"
  className={styles['externalLink']}
  title="打开魔丸官网"
>
  https://ukapi.cc ↗
</a>
```

- [ ] **Step 2: 魔丸布局完全平铺展开**

取消针对 `family === 'mowan'` 的 `<details>` 折叠：
- 直接平铺渲染 API 密钥字段
- 平铺渲染 API 地址 (baseURL) 字段
- 平铺渲染模型列表与同步区域

- [ ] **Step 3: 运行 `ui-settings-models` 现有测试**

Run: `pnpm exec vitest run packages/client/ui-settings-models`
Expected: PASS

- [ ] **Step 4: 提交更改**

```bash
git add packages/client/ui-settings-models
git commit -m "feat(ui-settings-models): 支持标题外链与平铺配置布局" --no-verify
```

---

### Task 3: 接入「同步模型」交互与魔丸模型列表配置

**Files:**
- Modify: `packages/client/ui-settings-models/src/client/ProviderEditor.tsx`
- Modify: `packages/client/ui-settings-models/src/client/ModelListEditor.tsx` (如需微调魔丸按钮文案或说明)

- [ ] **Step 1: 为魔丸模型配置区连接探测参数**

在魔丸平铺区域渲染 `ModelListEditor`，传入 `probe` 目标信息：
```tsx
<ModelListEditor
  {...catalogProps}
  probe={{
    settingsNs: 'llm-mowan',
    provider: 'mowan',
    baseURL: stringAt(draft, 'baseURL') ?? MOWAN_PUBLIC_BASE_URL,
    apiKey: stringAt(draft, 'apiKey'),
  }}
  api={api}
  probeBlocked={keyFailure}
/>
```

- [ ] **Step 2: 验证点击「同步模型」弹出候选列表并能勾选合并**

运行单测或交互测试验证 `fetchModels` 流程。

- [ ] **Step 3: 提交更改**

```bash
git add packages/client/ui-settings-models
git commit -m "feat(ui-settings-models): 为魔丸集成同步模型操作与模型选择弹窗" --no-verify
```

---

### Task 4: 重新构建客户端 Bundle 并运行完整回归测试

**Files:**
- Output: `packages/client/ui-settings-models/lib/client.js`

- [ ] **Step 1: 重新打包客户端**

Run: `pnpm --filter @deepseek-ai/dsh-client-ui-settings-models run bundle`
Expected: 编译成功生成 `lib/client.js`

- [ ] **Step 2: 运行全量关联测试套件**

Run: `pnpm exec vitest run packages/llm/llm-mowan packages/client/ui-settings-models packages/bundle/base`
Expected: 全部测试绿灯通过

- [ ] **Step 3: 提交编译生成文件（若有版本变动）**

```bash
git add packages/client/ui-settings-models
git commit -m "build(ui-settings-models): 重新构建客户端产物" --no-verify
```

---

### Task 5: 重启后台服务并在 3090 端口上进行全链路验证

**Files:**
- System: 后台服务作业管理

- [ ] **Step 1: 重启 Web 服务**

终止现有的后台作业并重新拉起服务：
`node --import tsx/esm apps/cli/src/bin.ts web --host 0.0.0.0`

- [ ] **Step 2: 验证服务响应与 API 接口**

调用 `/api/llm.providers` 与 `/api/llm.discoverModels` 验证魔丸模型发现接口正常响应。

- [ ] **Step 3: 验证客户端页面静态资源加载**

验证获取 `/plugins/@deepseek-ai/dsh-client-ui-settings-models/client.js` 返回最新代码且包含外链与平铺布局逻辑。
