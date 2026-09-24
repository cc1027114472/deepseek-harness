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
  /** Credential reference (environment variable) resolved per request; defaults to MOWAN_API_KEY. */
  apiKeyEnv?: string
  /** Endpoint base; defaults to https://ukapi.cc/v1beta. */
  baseURL?: string
  /** Default per-request output cap (default 32,768). */
  maxTokens?: number
  /** Positive context capacity used when model has no exact value (default 1,000,000). */
  defaultContextWindow?: number
  /** Advisory models list for discovery and UI. */
  models?: MowanCatalogModel[]
  /** Maximum provider idle time while stream read is outstanding. */
  streamIdleTimeoutMs?: number
  /** Provider-owned model-request retry policy. */
  retryPolicy?: RetryPolicyConfig
}
