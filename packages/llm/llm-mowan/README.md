# @deepseek-ai/dsh-llm-mowan

Native Mowan LLM adapter plugin for Cordis.
Registers the `mowan` provider route on `ctx.llm` as the first-class native provider.

## Config

```yaml
- id: llm-mowan
  name: '@deepseek-ai/dsh-llm-mowan'
  config:
    apiKeyEnv: MOWAN_API_KEY # default; fallback to AAAA_API_KEY if absent
    baseURL: https://ukapi.cc/v1beta
    defaultContextWindow: 1000000
    maxTokens: 32768
    streamIdleTimeoutMs: 300000
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

## Model Experience

### Mowan request

#### What the model sees

The selected model receives the harness prompt, conversation history, tool definitions, and attached modalities.

#### Token effect

Provider tokenization and context windows govern input and output bounds.

#### KV Cache effect

Dependent on upstream provider support across the `https://ukapi.cc/v1beta` endpoint.

### Mowan response

#### What the model sees

Streamed text, reasoning tokens, and tool calls are translated into harness `StreamChunk` events.

#### Token effect

Output tokens consume configured request limits up to `maxTokens`.

#### KV Cache effect

Retained responses append to subsequent context prefixes.

## Known Limitations and Deferred Work

- **Catalog list replacement**: Settings `models` list replaces the base list wholesale.
- **Provider protocol**: Built against the Google Generative AI gateway protocol supported by `ukapi.cc`.
