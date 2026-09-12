# Agent Note: Rename web_search to dsh_web_search and scope Gemini toolConfig

Status: implemented

English | [中文](2026-09-12-dsh-web-search-rename-and-gemini-tool-config.zh.md)

## Problem

When connecting to Google Gemini models (e.g. `gemini-3.7-flash-high`) via certain third-party proxy gateways that serve multiple model families, requests containing a function declaration named `web_search` consistently failed with upstream HTTP 400:

```
Please enable tool_config.include_server_side_tool_invocations to use Built-in tools with Function calling.
```

The gateway intercepted any function declaration named `web_search` or `google_search`, interpreting it as Google's built-in Search Grounding tool rather than a client-defined function tool. When paired with standard function declarations (`bash`, `read`, etc.), the upstream Google API requires `tool_config.include_server_side_tool_invocations: true` to allow mixing built-in tools with client function calling. Even when `PiAiAdapter` provided this flag in `p.config.toolConfig`, third-party gateway protocol normalizers dropped the field during proxying, resulting in upstream rejection.

Additionally, unconditionally injecting `includeServerSideToolInvocations` on all Google-family models broke `google-vertex`, whose SDK serializer does not accept this field and throws during parameter conversion.

## Decision

1. **Rename the model-facing search tool to `dsh_web_search`.**
   Renaming the tool from `web_search` to `dsh_web_search` avoids third-party gateway reserved-word heuristics. Replay tests confirmed that requests with `dsh_web_search` succeed (HTTP 200) across all 26 default tools without triggering proxy-side built-in tool interception.

2. **Restrict `includeServerSideToolInvocations` injection to `google-generative-ai`.**
   In `packages/llm/llm-pi-ai/src/adapter.ts`, guard the `toolConfig` population so it runs only when `model.api === 'google-generative-ai'`, preventing Vertex AI serializer failures.

3. **Synchronize all contract surfaces across the repository.**
   Update prompt guidance, `tool-web` tests, `gen-tool-catalog.spec.ts`, client UI toolview bindings (`WebRow` key and title mappings in `ui-tool`), client fixtures, and the generated `docs/tool-catalog.md`.

## Consequences

- Requests via third-party Gemini gateways now execute cleanly without 400 errors.
- The change is repository-wide: all providers and models see `dsh_web_search` as the standard search tool.
- The adapter layer remains clean and stateless without requiring fragile bidirectional name-aliasing shims.

## Alternatives considered

**Bidirectional tool name aliasing in `PiAiAdapter`.**
We could dynamically rewrite `web_search` to a temporary name when sending payloads to Google endpoints, and rewrite incoming model tool calls back to `web_search`. Rejected: this introduces stateful name-mapping logic into the transport adapter and fragile edge cases across streaming chunks. In the pre-release phase, we prefer a consistent, unambiguous foundation over compatibility shims.

**Relying solely on `includeServerSideToolInvocations`.**
We confirmed that even with the camelCase and snake_case `include_server_side_tool_invocations` flags sent, multi-provider proxy gateways dropped the parameter before reaching Google. Renaming the tool is the only change that is robust against gateway transformation.
