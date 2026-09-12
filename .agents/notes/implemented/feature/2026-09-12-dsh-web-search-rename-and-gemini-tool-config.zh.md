# Agent Note: 将 web_search 重命名为 dsh_web_search 并限定 Gemini toolConfig 作用域

Status: implemented

[English](2026-09-12-dsh-web-search-rename-and-gemini-tool-config.md) | 中文

## 问题

通过某些服务多模型家族的第三方代理网关连接 Google Gemini 模型（如 `gemini-3.7-flash-high`）时，包含名为 `web_search` 的函数声明的请求持续遭遇上游 HTTP 400 失败：

```
Please enable tool_config.include_server_side_tool_invocations to use Built-in tools with Function calling.
```

该代理网关会拦截任何名为 `web_search` 或 `google_search` 的函数声明，将其解释为 Google 内置的 Search Grounding 工具，而非客户端自定义的函数工具。当其与标准函数声明（`bash`、`read` 等）混合使用时，上游 Google API 要求显式开启 `tool_config.include_server_side_tool_invocations: true` 才能允许内置工具与函数调用混用。即使 `PiAiAdapter` 在 `p.config.toolConfig` 中提供了该字段，第三方网关的协议转换逻辑在转发时也会丢弃此字段，导致上游拒绝请求。

此外，无条件对所有 Google 家族模型注入 `includeServerSideToolInvocations` 会破坏 `google-vertex`，其 SDK 序列化器不接受该字段，在参数转换时会抛出异常。

## 决策

1. **将面向模型的搜索工具重命名为 `dsh_web_search`。**
   将工具从 `web_search` 重命名为 `dsh_web_search` 彻底避开了第三方网关的保留字嗅探逻辑。回放测试证实，在全部 26 个默认工具集下，包含 `dsh_web_search` 的请求均能成功（HTTP 200），不再触发网关侧的内置工具拦截。

2. **将 `includeServerSideToolInvocations` 注入限定在 `google-generative-ai`。**
   在 `packages/llm/llm-pi-ai/src/adapter.ts` 中增加保护，仅在 `model.api === 'google-generative-ai'` 时注入 `toolConfig`，避免 Vertex AI 序列化器报错。

3. **全仓库同步更新相关约定界面。**
   同步更新系统提示词指引、`tool-web` 测试、`gen-tool-catalog.spec.ts`、客户端 UI 工具视图绑定（`ui-tool` 中的 `WebRow` 键与标题映射）、客户端 fixture 以及生成的 `docs/tool-catalog.md`。

## 影响

- 经由第三方 Gemini 网关发起的请求现在可以顺畅执行，不再报 400 错误。
- 该变更为全仓库行为：所有提供方与模型均统一将 `dsh_web_search` 视为标准搜索工具。
- 适配器层保持简洁和无状态，无需引入脆弱的双向名称转译兼容层。

## 考虑过的备选方案

**在 `PiAiAdapter` 中进行双向工具名转译（Aliasing）。**
向 Google 端点发送请求时动态将 `web_search` 改写为临时名称，并在模型返回工具调用时改写回 `web_search`。未采纳：这会在传输适配层引入带状态的名称映射逻辑，且在流式分块场景下存在脆弱的边界条件。在 Pre-release 阶段，我们优先选择清晰、无歧义的地基实现，而非兼容垫片。

**仅依赖 `includeServerSideToolInvocations` 参数。**
实测证实，即使发送了驼峰（camelCase）和下划线（snake_case）的 `include_server_side_tool_invocations` 标记，多模型中转网关在转发给 Google 前也会丢弃该参数。重命名工具是唯一能免疫网关协议转换影响的方案。
