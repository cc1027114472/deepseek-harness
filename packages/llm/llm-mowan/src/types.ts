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
