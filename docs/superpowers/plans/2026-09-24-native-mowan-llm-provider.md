# 魔丸原生模型提供商插件（llm-mowan）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建专属的魔丸原生模型适配器插件 `@deepseek-ai/dsh-llm-mowan`，将其作为项目官方原生提供商挂载，彻底剥离 `llm-pi-ai` 临时多供应商配置，使魔丸拥有第一公民地位。

**Architecture:** 新建 `packages/llm/llm-mowan` 包，封装 `google-generative-ai` 协议流式传输；向 `ctx.llm` 注册官方路由 `mowan`、一级命名空间 `llm-mowan` 及 `MowanAdapter`；在 `cordis.patch.yml` 中激活魔丸并移除 `llm-pi-ai.providers.aaaa`；在前端 `ui-settings-models` 识别魔丸原生卡片，展示纯净的原生设置界面。

**Tech Stack:** TypeScript, Cordis (`@deepseek-ai/cordis`), `@deepseek-ai/dsh-llm`, `@deepseek-ai/schemastery`, `@deepseek-ai/dsh-settings`, `@earendil-works/pi-ai`, Vitest, React.

---

### Task 1: 创建 `packages/llm/llm-mowan` 基础包文件

**Files:**
- Create: `packages/llm/llm-mowan/package.json`
- Create: `packages/llm/llm-mowan/tsconfig.json`
- Create: `packages/llm/llm-mowan/src/types.ts`
- Create: `packages/llm/llm-mowan/src/invariant.ts`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@deepseek-ai/dsh-llm-mowan",
  "version": "0.1.0",
  "description": "Native Mowan model adapter plugin for Cordis",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@deepseek-ai/cordis": "workspace:^",
    "@deepseek-ai/dsh-credentials": "workspace:^",
    "@deepseek-ai/dsh-llm": "workspace:^",
    "@deepseek-ai/dsh-schemastery": "workspace:^",
    "@deepseek-ai/dsh-settings": "workspace:^",
    "@deepseek-ai/schemastery": "workspace:^",
    "@earendil-works/pi-ai": "^0.60.2"
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "workspace:^"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "lib/types"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: 创建 src/types.ts 和 src/invariant.ts**

`src/types.ts`:
```ts
import type { ModelModality, RetryPolicyConfig } from '@deepseek-ai/dsh-llm'

export interface MowanCatalogModel {
  id: string
  name?: string
  description?: string
  contextWindow?: number
  maxTokens?: number
  inputModalities?: ModelModality[]
}

export interface MowanConfig {
  apiKeyEnv?: string
  baseURL?: string
  defaultContextWindow?: number
  maxTokens?: number
  models?: MowanCatalogModel[]
  streamIdleTimeoutMs?: number
  retryPolicy?: RetryPolicyConfig
}
```

`src/invariant.ts`:
```ts
export function checkPackageInvariants(): void {
  // Empty installer invariant per package invariant rules
}
```

- [ ] **Step 4: 运行类型检查验证基础结构**

Run: `pnpm --filter @deepseek-ai/dsh-llm-mowan exec tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add packages/llm/llm-mowan
git commit -m "feat(llm-mowan): 初始化 packages/llm/llm-mowan 基础包"
```

---

### Task 2: 实现 `packages/llm/llm-mowan` 适配器与插件主入口

**Files:**
- Create: `packages/llm/llm-mowan/src/adapter.ts`
- Create: `packages/llm/llm-mowan/src/index.ts`

- [ ] **Step 1: 实现 src/adapter.ts**

实现 `MowanAdapter`，将 Harness 的会话与工具调用转换为 `google-generative-ai` 协议，并通过流式接口返回 chunk 与消耗统计。

```ts
import type {
  LlmAdapter,
  LlmRequest,
  StreamChunk,
  TokenUsage,
  CallId,
} from '@deepseek-ai/dsh-llm'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy'
import type { MowanConfig } from './types.ts'

export interface MowanAdapterOptions {
  options: () => MowanConfig
  resolveApiKey: () => Promise<string>
}

export class MowanAdapter implements LlmAdapter {
  constructor(private readonly deps: MowanAdapterOptions) {}

  async *stream(request: LlmRequest): AsyncGenerator<StreamChunk> {
    const config = this.deps.options()
    const apiKey = await this.deps.resolveApiKey()
    const baseURL = config.baseURL ?? 'https://ukapi.cc/v1beta'

    const streamsFactory = googleGenerativeAIApi()
    const stream = streamsFactory.stream(
      {
        id: request.model,
        name: request.model,
        provider: 'mowan',
        api: 'google-generative-ai',
        baseUrl: baseURL,
        input: ['text', 'image'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      } as any,
      {
        messages: request.messages as any,
        tools: request.tools as any,
      },
      {
        apiKey,
        maxTokens: request.maxTokens ?? config.maxTokens ?? 32768,
      },
    )

    for await (const event of stream) {
      if (event.type === 'text_delta') {
        yield { kind: 'text', delta: event.delta }
      } else if (event.type === 'tool_call') {
        yield {
          kind: 'tool-call',
          id: (event.id ?? `call_${Date.now()}`) as CallId,
          name: event.name,
          argsJson: typeof event.arguments === 'string' ? event.arguments : JSON.stringify(event.arguments),
        }
      } else if (event.type === 'finish') {
        yield {
          kind: 'finish',
          reason: event.reason === 'tool_calls' ? 'tool-calls' : 'stop',
          usage: event.usage ? {
            inputTokens: event.usage.input,
            outputTokens: event.usage.output,
          } : undefined,
        }
      } else if (event.type === 'error') {
        throw new LlmError(event.error?.message ?? 'Mowan streaming error', 'SERVER')
      }
    }
  }
}
```

- [ ] **Step 2: 实现 src/index.ts 插件主入口**

```ts
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { RetryPolicySchema, assertUsableApiKey } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { MowanAdapter } from './adapter.ts'
import type { MowanCatalogModel, MowanConfig } from './types.ts'

export const name = 'llm-mowan'
export const inject = ['llm']

const NS = settingsNamespace('llm-mowan')
export const PROVIDER = 'mowan'
export const PUBLIC_BASE_URL = 'https://ukapi.cc/v1beta'
const DEFAULT_API_KEY_ENV = 'MOWAN_API_KEY'
const FALLBACK_API_KEY_ENV = 'AAAA_API_KEY'

export const DEFAULT_MODELS: MowanCatalogModel[] = [
  { id: 'gemini-3.7-flash-high', name: 'gemini-3.7-flash-high', inputModalities: ['text', 'image'] },
  { id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6', inputModalities: ['text', 'image'] },
  { id: 'gemini-3.8-flash-high', name: 'gemini-3.8-flash-high', inputModalities: ['text', 'image'] },
  { id: 'gemini-3.8-flash-medium', name: 'gemini-3.8-flash-medium', inputModalities: ['text', 'image'] },
]

export const Config: z<MowanConfig> = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: z.string().default(PUBLIC_BASE_URL),
  maxTokens: z.number().step(1).min(1).default(32768),
  defaultContextWindow: z.number().step(1).min(1).default(1000000),
  models: z.array(z.object({
    id: z.string().required(),
    name: z.string(),
    description: z.string(),
    contextWindow: z.number().step(1),
    maxTokens: z.number().step(1),
    inputModalities: z.array(z.union(['text', 'image'])),
  })).default(DEFAULT_MODELS),
  retryPolicy: RetryPolicySchema,
})

export function apply(ctx: Context, config: MowanConfig): void {
  let current: MowanConfig = { ...config }
  const options = (): MowanConfig => ({
    ...config,
    ...current,
    baseURL: current.baseURL ?? config.baseURL ?? PUBLIC_BASE_URL,
    models: current.models ?? config.models ?? DEFAULT_MODELS,
  })

  const resolveApiKey = async (): Promise<string> => {
    const creds = ctx.get('credentials')
    const keyEnv = options().apiKeyEnv ?? DEFAULT_API_KEY_ENV
    let key = creds ? await creds.resolve(credentialRef(keyEnv)) : process.env[keyEnv]
    if (!key && keyEnv === DEFAULT_API_KEY_ENV) {
      key = creds ? await creds.resolve(credentialRef(FALLBACK_API_KEY_ENV)) : process.env[FALLBACK_API_KEY_ENV]
    }
    return assertUsableApiKey(key, 'llm-mowan: missing API key', 'MISSING_CREDENTIAL')
  }

  const adapter = new MowanAdapter({
    options,
    resolveApiKey,
  })

  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: '魔丸', settingsNs: NS, settingsPath: [] },
  ])
  ctx.llm.registerAdapter([PROVIDER], adapter)

  installSettingsSection(ctx, NS, Config, config, {
    setSource: (source) => { current = source },
  })
}
```

- [ ] **Step 3: 运行类型检查验证**

Run: `pnpm --filter @deepseek-ai/dsh-llm-mowan exec tsc --noEmit`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add packages/llm/llm-mowan
git commit -m "feat(llm-mowan): 实现 MowanAdapter 与 Cordis 插件入口"
```

---

### Task 3: 编写 `packages/llm/llm-mowan` 单元测试

**Files:**
- Create: `packages/llm/llm-mowan/tests/adapter.spec.ts`

- [ ] **Step 1: 编写测试文件**

测试适配器实例化、配置合并以及缺少凭证时的拒绝机制。

```ts
import { describe, it, expect } from 'vitest'
import { MowanAdapter } from '../src/adapter.ts'
import { DEFAULT_MODELS, PUBLIC_BASE_URL } from '../src/index.ts'

describe('MowanAdapter', () => {
  it('instantiates properly with options', () => {
    const adapter = new MowanAdapter({
      options: () => ({ baseURL: PUBLIC_BASE_URL, models: DEFAULT_MODELS }),
      resolveApiKey: async () => 'test-key',
    })
    expect(adapter).toBeDefined()
  })

  it('fails with MISSING_CREDENTIAL when api key is empty', async () => {
    const adapter = new MowanAdapter({
      options: () => ({ baseURL: PUBLIC_BASE_URL }),
      resolveApiKey: async () => {
        throw new Error('MISSING_CREDENTIAL')
      },
    })
    await expect(async () => {
      for await (const _ of adapter.stream({ model: 'gemini-3.7-flash-high', messages: [] } as any)) {}
    }).rejects.toThrow('MISSING_CREDENTIAL')
  })
})
```

- [ ] **Step 2: 运行测试并确保通过**

Run: `pnpm exec vitest run packages/llm/llm-mowan/tests/adapter.spec.ts`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add packages/llm/llm-mowan/tests
git commit -m "test(llm-mowan): 添加 MowanAdapter 单元测试"
```

---

### Task 4: 系统装配与 `cordis.patch.yml` 调整

**Files:**
- Modify: `packages/bundle/base/package.json`
- Modify: `packages/bundle/base/cordis.patch.yml`

- [ ] **Step 1: 在 `packages/bundle/base/package.json` 中引入 `@deepseek-ai/dsh-llm-mowan`**

- [ ] **Step 2: 在 `packages/bundle/base/cordis.patch.yml` 中挂载 `llm-mowan`**

添加：
```yaml
    - id: llm-mowan
      name: '@deepseek-ai/dsh-llm-mowan'
```
移除 `llm-pi-ai` 下 `providers.aaaa` 配置，恢复纯净的 `llm-pi-ai`；
设置默认模型为 `mowan/gemini-3.7-flash-high`。

- [ ] **Step 3: 运行全量类型检查**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add packages/bundle/base
git commit -m "feat(composition): 挂载 llm-mowan 原生提供商并移除 aaaa 临时配置"
```

---

### Task 5: 前端 UI 模型设置页面适配（`ui-settings-models`）

**Files:**
- Modify: `packages/client/ui-settings-models/src/client/ProviderEditor.tsx`
- Modify: `packages/client/ui-settings-models/src/client/ModelsSection.tsx`

- [ ] **Step 1: 适配 `ProviderEditor.tsx` 中的布局判断**

将 `llm-mowan` 作为官方原生提供商识别：
```ts
function layoutOf(ns: string): EditorLayout {
  if (ns === 'llm-deepseek' || ns === 'llm-mowan') return 'mowan'
  if (ns === 'llm-pi-ai') return 'pi-ai'
  return 'unknown'
}
```
配置默认 BaseURL 为 `https://ukapi.cc/v1beta`，移除历史的 `isMowan` 判断分支。

- [ ] **Step 2: 重新打包客户端 bundle 并运行测试**

Run: `pnpm --filter @deepseek-ai/dsh-client-ui-settings-models run bundle`
Run: `pnpm exec vitest run packages/client/ui-settings-models`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add packages/client/ui-settings-models
git commit -m "feat(ui): 将魔丸作为官方第一公民原生提供商进行适配"
```

---

### Task 6: 服务启动与全链路验证

- [ ] **Step 1: 重启本地 Web 服务**
- [ ] **Step 2: 验证 3090 端口 HTTP 200**
- [ ] **Step 3: 检查工作区状态并输出完成总结**
