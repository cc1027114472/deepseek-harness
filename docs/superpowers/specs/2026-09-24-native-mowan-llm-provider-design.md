# 魔丸原生模型提供商插件（llm-mowan）设计规范

## 1. 背景与目标

在原版 DeepSeek Harness (DSH) 中，`llm-deepseek` 是唯一的原生第一公民（Native First-class Provider），在 Cordis 容器中拥有专属的插件包、专属的一级配置命名空间 `llm-deepseek`、官方提供商标识以及原生 UI 呈现。

在本项目（魔丸专属分支/仓库）中，此前将魔丸通过通用多供应商插件 `llm-pi-ai` 下的 `aaaa` 临时挂载，导致：
- 魔丸在前端 UI 中被判定为手写声明的“自定义”提供商（Custom Tag）；
- 配置文件中嵌套在 `llm-pi-ai.providers.aaaa` 下，语义不清晰且缺乏第一公民地位；
- 无法形成像 `llm-deepseek` 那样独立、纯粹的插件生命周期与设置管理。

### 1.1 核心目标
1. **打造专属原生插件**：新增 `packages/llm/llm-mowan`（`@deepseek-ai/dsh-llm-mowan`），作为魔丸的原生模型适配器。
2. **第一公民地位**：
   - 提供商路由 ID 为 `mowan`，前端显示名称为 `魔丸`。
   - 拥有顶级专属设置命名空间 `llm-mowan`，配置文件通过一级节点 `llm-mowan:` 管理。
   - 前端 UI 视其为内置原生提供商，移除“自定义”标签，支持直接配置 API Key 与 BaseURL。
3. **协议原生支持**：魔丸网关（`https://ukapi.cc/v1beta`）使用 `google-generative-ai` 协议，插件原生封装其流式传输、Token 统计与错误映射。
4. **清理多供应商耦合**：从 `llm-pi-ai` 中彻底剥离 `aaaa`，恢复 `llm-pi-ai` 仅作为用户可选扩展的纯净状态。
5. **完全独立与隔离**：所有改动严格限定在当前魔丸仓库内，与原版 `deepseek-harness-fresh` 目录及环境彻底解耦，互不干扰。

---

## 2. 模块架构与包设计

### 2.1 新建包 `packages/llm/llm-mowan`
* **包名**：`@deepseek-ai/dsh-llm-mowan`
* **定位**：Workspace 内部插件包，依赖 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-llm`、`@deepseek-ai/dsh-credentials`、`@deepseek-ai/dsh-settings` 以及 `@earendil-works/pi-ai`（底层复用其经充分验证的 `google-generative-ai` 流式协议）。

### 2.2 核心文件规划
* `package.json`：声明 ESM 规范与 workspace 依赖。
* `tsconfig.json`：严格 TypeScript 配置，继承自 monorepo 标准。
* `src/index.ts`：
  - Cordis 插件入口，注册 `llm` 注入依赖。
  - 通过 `installSettingsSection` 安装 `llm-mowan` 顶级命名空间。
  - 向 `ctx.llm` 调用 `registerConfigurableProviders` 注册官方提供商元数据：
    `{ provider: 'mowan', displayName: '魔丸', settingsNs: 'llm-mowan', settingsPath: [] }`。
  - 实例化 `MowanAdapter`，调用 `ctx.llm.registerAdapter(['mowan'], adapter)` 完成路由注册。
* `src/adapter.ts`：
  - 实现 Harness 的 `LlmAdapter` 接口。
  - 解析动态配置（BaseURL、API Key、模型定义、重试策略）。
  - 连接魔丸网关并驱动流式消息交互、Tool Call 参数解析、消耗用量（Token Usage）映射。
* `src/types.ts` & `src/config.ts`：
  - 定义 `MowanConfig`、`MowanModel` 以及 Schemastery 校验模式。

### 2.3 默认配置契约
```yaml
llm-mowan:
  baseURL: https://ukapi.cc/v1beta
  apiKeyEnv: MOWAN_API_KEY
  models:
    - id: gemini-3.7-flash-high
      name: gemini-3.7-flash-high
      inputModalities: [text, image]
    - id: claude-sonnet-4-6
      name: claude-sonnet-4-6
      inputModalities: [text, image]
    - id: gemini-3.8-flash-high
      name: gemini-3.8-flash-high
      inputModalities: [text, image]
    - id: gemini-3.8-flash-medium
      name: gemini-3.8-flash-medium
      inputModalities: [text, image]
```
凭证解析逻辑：优先解析 `MOWAN_API_KEY`，若不存在则回退兼容已有的 `AAAA_API_KEY`，确保无缝平滑迁移。

---

## 3. 系统级装配（Composition）调整

### 3.1 基础装配配置 `packages/bundle/base/cordis.patch.yml`
1. **挂载原生插件**：
   ```yaml
   - id: llm-mowan
     name: '@deepseek-ai/dsh-llm-mowan'
   ```
2. **清理多供应商插件**：
   移除 `llm-pi-ai` 中的 `providers.aaaa` 配置块，使 `llm-pi-ai` 恢复为纯粹的空置多供应商底座。
3. **保持 `llm-deepseek` 禁用**：
   继续维持 `llm-deepseek: disabled: true`，确保魔丸是运行时唯一的官方原生提供商。

### 3.2 默认模型调整
系统默认会话模型与预设模型均指向魔丸原生路由：
`mowan/gemini-3.7-flash-high`

---

## 4. 前端 UI 适配（`ui-settings-models`）

1. **识别原生布局**：
   在 `packages/client/ui-settings-models/src/client/ProviderEditor.tsx` 中，将 `llm-mowan` 归类为原生受支持家族（例如 `mowan` 或复用专属的官方原生卡片逻辑）：
   * 不显示“自定义”角标；
   * 提供针对魔丸 BaseURL 与 API Key 的可视化配置界面；
   * 默认 BaseURL 占位符设为 `https://ukapi.cc/v1beta`。
2. **清理历史兼容逻辑**：
   移除此前在 `ModelsSection.tsx` 与 `ProviderEditor.tsx` 中临时硬编码的 `isMowan = provider === 'aaaa'` 条件判断，由统一的 `target.settingsNs === 'llm-mowan'` 和 `provider === 'mowan'` 原生机制接管。

---

## 5. 验证与测试方案

1. **单元测试与类型检查**：
   * 为 `packages/llm/llm-mowan` 编写单元测试（适配器实例化、配置热重载、凭证解析）。
   * 执行 `pnpm --filter @deepseek-ai/dsh-llm-mowan run typecheck`。
2. **集成验证**：
   * 启动 Web 服务（端口 3090），验证控制台输出与插件加载正常。
   * 打开 `http://127.0.0.1:3090`，在“模型设置”页面检查：
     - 魔丸以官方原生形态显示，无“自定义”标签；
     - 模型列表展示完整；
     - 发起对话调用，验证能够正常通过魔丸网关流式返回响应。
3. **独立性检查**：
   * 检查 `D:\GOWorks\deepseek-harness-fresh\`，确认其未被写入或修改。
