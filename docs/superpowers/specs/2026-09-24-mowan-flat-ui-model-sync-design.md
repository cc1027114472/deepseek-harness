# 魔丸模型设置平铺布局与模型同步设计规范

- **状态**: 已确认 (Approved)
- **方案**: 方案 B（完全平铺布局 + 官网外链 + 动态模型同步）
- **涉及包**:
  - `packages/llm/llm-mowan`: 注册并提供模型发现服务 (`ctx.llm.registerModelDiscovery`)
  - `packages/client/ui-settings-models`: 标题外链、平铺式表单、魔丸模型列表展示与同步弹窗交互

---

## 1. 目标与背景

用户希望在模型设置页面中进一步提升魔丸作为主打原生提供商的操作体验：
1. **官网外链**：在标题「魔丸 `mowan`」右侧展示控制台/网关网址 `https://ukapi.cc`，点击后直接在浏览器新窗口中跳转打开。
2. **平铺布局（把模型放出来）**：取消原先收拢在 `<details>`「自定义设置」中的折叠展示，直接将 API 密钥、API 地址 (baseURL) 和已配置模型列表平铺展示在卡片主体中。
3. **点击同步模型**：在模型列表区域提供「同步模型」操作，点击后基于当前输入的 API 密钥或已保存凭据向魔丸网关接口 `https://ukapi.cc/v1beta/models` 发起探测，支持勾选并一键同步添加网关最新开放的模型。

---

## 2. 详细技术方案

### 2.1 后端：魔丸模型探测服务 (`packages/llm/llm-mowan`)

1. **注册模型探测**：
   - 在 `packages/llm/llm-mowan/src/index.ts` 中调用 `ctx.llm.registerModelDiscovery(NS, ...)`。
   - 提取或实现专用探测逻辑 `discoverMowanModels(request, storedApiKeyResolver)`：
     - 请求地址统一拼装为 `${baseURL.replace(/\/+$/, '')}/models`（默认对应 `https://ukapi.cc/v1beta/models`）。
     - 支持请求头中附带鉴权信息：
       - `Authorization: Bearer <key>`
       - `x-goog-api-key: <key>`
     - 凭据解析策略：表单提交的临时 `request.apiKey` 优先；若未提供则调用内部凭据解析方法读取系统中的 `MOWAN_API_KEY` 或回退的 `AAAA_API_KEY`。
     - 解析返回的 JSON 列表（兼容 Google Generative AI 和 OpenAI 两种常见模型返回结构），提取模型 `id`、`name`、`context_window`、`max_tokens` 等并标准化为 `LlmDiscoveredModel[]`。
   - 处理异常：当未提供 API Key 时给出友好的未授权错误提示；当网关无法连接时提示检查网络或端点。

### 2.2 前端：界面布局与交互增强 (`packages/client/ui-settings-models`)

1. **标题区外链**：
   - 在 `ProviderEditor.tsx` 的 Header 中：
     - 若 `family === 'mowan'`，在 `props.provider` 标签旁渲染外链链接：
       - 文本展示：`https://ukapi.cc`
       - 属性：`target="_blank" rel="noreferrer"`
       - 样式：保持与现有徽标、副标题统一的代码字体/暗色高亮效果，附带外跳小图标。

2. **完全平铺布局**：
   - 针对 `family === 'mowan'`，不再包裹于 `<details className={styles['advanced']}>` 中：
     - 第一部分：API 密钥输入框（支持编辑、保存、清除）。
     - 第二部分：API 基础地址 (baseURL)，输入框 placeholder 为 `https://ukapi.cc/v1beta`。
     - 第三部分：模型列表及管理操作，直接展开平铺显示。

3. **模型列表与同步操作**：
   - 复用或集成 `ModelListEditor`：
     - 传入 `probe={{ settingsNs: 'llm-mowan', provider: 'mowan', baseURL: ..., apiKey: ... }}`。
     - 按钮文案在魔丸下明确为「同步模型」（或复用标准探测逻辑）。
     - 点击「同步模型」触发 `api.llm.discoverModels`：
       - 加载中显示 loading 态。
       - 探测成功后打开模型候选选择弹窗，列出网关返回的所有模型。
       - 默认勾选未配置的新模型，用户确认后一键合并入当前模型列表。
       - 用户亦可手动添加/编辑已有模型的上下文窗口大小和 Token 限制。

---

## 3. 测试与验收标准

1. **单元测试**：
   - `packages/llm/llm-mowan`: 增加对 `ctx.llm.discoverModels('llm-mowan', ...)` 的测试用例（包括携带临时 Key、读取内置 Key、网关响应解析等）。
   - `packages/client/ui-settings-models`: 运行现有组件测试并补充针对平铺渲染和魔丸外链的用例。
2. **端到端验证**：
   - 重新构建客户端产物并在 `http://127.0.0.1:3090` 验证：
     - 标题右侧正常显示 `https://ukapi.cc` 链接，点击可跳转。
     - 卡片内容完全平铺展示，模型列表直接可见。
     - 点击「同步模型」能正常触发探测对话框。
