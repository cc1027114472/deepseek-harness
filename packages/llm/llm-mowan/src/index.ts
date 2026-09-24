/**
 * Native Mowan LLM adapter plugin for Cordis.
 * Registers the `mowan` provider route on `ctx.llm` as the first-class native provider.
 * @module @deepseek-ai/dsh-llm-mowan
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { assertUsableApiKey, LlmError, RetryPolicySchema } from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle, ModelModality } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { deepEqualJson, installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import {
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  PiAiAdapter,
  authContextFrom,
  credentialStoreFrom,
  resolveProfiles,
  type PiAiModelProfile,
  type PiAiProviderProfile,
  type ResolvedPiAiProviderProfile,
} from '@deepseek-ai/dsh-llm-pi-ai'
import type { MowanCatalogModel, MowanConfig } from './types.ts'

export type { MowanCatalogModel, MowanConfig } from './types.ts'

export const name = 'llm-mowan'
export const inject = ['llm']

const NS = settingsNamespace('llm-mowan')
export const PROVIDER = 'mowan'
export const PUBLIC_BASE_URL = 'https://ukapi.cc/v1beta'
export const DEFAULT_API_KEY_ENV = 'MOWAN_API_KEY'
export const FALLBACK_API_KEY_ENV = 'AAAA_API_KEY'

export const DEFAULT_MODELS: MowanCatalogModel[] = [
  { id: 'gemini-3.7-flash-high', name: 'gemini-3.7-flash-high', inputModalities: ['text', 'image'] },
  { id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6', inputModalities: ['text', 'image'] },
  { id: 'gemini-3.8-flash-high', name: 'gemini-3.8-flash-high', inputModalities: ['text', 'image'] },
  { id: 'gemini-3.8-flash-medium', name: 'gemini-3.8-flash-medium', inputModalities: ['text', 'image'] },
]

const MODEL_MODALITIES = ['text', 'image'] as const satisfies readonly ModelModality[]

const catalogModel: z<MowanCatalogModel> = z.object({
  id: z.string().required(),
  name: z.string(),
  description: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  inputModalities: z.array(z.union(MODEL_MODALITIES)).min(1).default(['text']),
})

export const Config: z<MowanConfig> = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: z.string().default(PUBLIC_BASE_URL),
  maxTokens: z.number().step(1).min(1).default(32768),
  defaultContextWindow: z.number().step(1).min(1).default(1000000),
  models: z.array(catalogModel).default(DEFAULT_MODELS),
  streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
  retryPolicy: RetryPolicySchema,
})

export function apply(ctx: Context, config: MowanConfig): void {
  let current: () => MowanConfig = () => config
  const options = (): MowanConfig => {
    const raw = current()
    const merged: MowanConfig = {
      ...config,
      ...raw,
      baseURL: raw.baseURL ?? config.baseURL ?? PUBLIC_BASE_URL,
      models: raw.models ?? config.models ?? DEFAULT_MODELS,
    }
    return merged
  }

  const profiles = (): ReadonlyMap<string, ResolvedPiAiProviderProfile> => {
    const conf = options()
    const models = conf.models ?? DEFAULT_MODELS
    const profile: PiAiProviderProfile = {
      displayName: '魔丸',
      baseURL: conf.baseURL ?? PUBLIC_BASE_URL,
      api: 'google-generative-ai',
      apiKeyEnv: conf.apiKeyEnv ?? DEFAULT_API_KEY_ENV,
      models: models.map((m): PiAiModelProfile => ({
        id: m.id,
        name: m.name ?? m.id,
        contextWindow: m.contextWindow ?? conf.defaultContextWindow ?? 1000000,
        maxTokens: m.maxTokens ?? conf.maxTokens ?? 32768,
        input: m.inputModalities ?? ['text', 'image'],
      })),
      streamIdleTimeoutMs: conf.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS,
      ...conf.retryPolicy === undefined ? {} : { retryPolicy: conf.retryPolicy },
    }

    return resolveProfiles({
      [PROVIDER]: profile,
    })
  }

  const resolveApiKey = async (provider: string, profile: ResolvedPiAiProviderProfile): Promise<string | undefined> => {
    const ref = profile.apiKeyEnv ?? DEFAULT_API_KEY_ENV
    const credentials = ctx.get('credentials')

    // Try primary keyEnv
    let hit = credentials !== undefined
      ? (await credentials.resolve(credentialRef(ref)))?.value
      : launchEnvironmentOf(ctx).get(ref)?.value

    // If missing and still on default ref, try legacy fallback AAAA_API_KEY
    if ((hit === undefined || hit.length === 0) && ref === DEFAULT_API_KEY_ENV) {
      hit = credentials !== undefined
        ? (await credentials.resolve(credentialRef(FALLBACK_API_KEY_ENV)))?.value
        : launchEnvironmentOf(ctx).get(FALLBACK_API_KEY_ENV)?.value
    }

    if (hit !== undefined && hit.length > 0) {
      return assertUsableApiKey(hit, 'llm-mowan', ref)
    }

    throw new LlmError(
      `llm-mowan: no credential for provider route "${provider}"; its profile resolves ${ref}, which is not set`
      + ` — store ${ref} through the credentials service or export it.`,
      'MISSING_CREDENTIAL',
    )
  }

  const auth = { credentials: credentialStoreFrom(ctx), authContext: authContextFrom(ctx) }
  const adapter = new PiAiAdapter({
    profiles,
    resolveApiKey,
    auth,
    resolveAttachments: () => ctx.get('attachments'),
    onReplayDegrade: ({ provider, model, reason }) => {
      ctx.logger.warn(
        `llm-mowan: unusable replay state on assistant history for route "${provider}/${model}";`
        + ` sending that message as provider-neutral content (${reason})`,
      )
    },
  })

  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: '魔丸', settingsNs: NS, settingsPath: [] },
  ])

  let registration: AdapterRegistrationHandle | undefined
  let registeredFacts: unknown

  const ensureRegistrationFacts = (): void => {
    const currentProfiles = profiles()
    const facts = {
      routes: [...currentProfiles.keys()],
      retryPolicy: currentProfiles.get(PROVIDER)?.retryPolicy,
    }
    if (deepEqualJson(facts, registeredFacts)) return

    if (registration === undefined) {
      registration = ctx.llm.registerAdapter([PROVIDER], adapter)
    } else {
      registration.replace([PROVIDER])
    }
    registeredFacts = facts
  }

  ensureRegistrationFacts()

  installSettingsSection(ctx, NS, Config, config, {
    setSource: (source) => {
      current = source
    },
    onChange: ensureRegistrationFacts,
  })
}
