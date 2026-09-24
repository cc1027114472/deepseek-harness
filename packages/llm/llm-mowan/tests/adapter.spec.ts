import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { FileSettingsProvider } from '@deepseek-ai/dsh-settings-file'
import * as LlmMowan from '../src/index.ts'

describe('llm-mowan', () => {
  it('registers mowan provider with default models and provider info', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmMowan, {})

    const providers = ctx.llm.listProviders()
    const info = providers.find(p => p.id === 'mowan')
    expect(info).toEqual({ id: 'mowan', name: '魔丸' })

    const models = await ctx.llm.listModels('mowan')
    expect(models.map(m => m.id)).toEqual([
      'gemini-3.7-flash-high',
      'claude-sonnet-4-6',
      'gemini-3.8-flash-high',
      'gemini-3.8-flash-medium',
    ])

    for (const model of models) {
      expect(model.inputModalities).toEqual(['text', 'image'])
    }

    const resolved = await ctx.llm.resolveModelInfo('mowan', 'gemini-3.7-flash-high')
    expect(resolved.id).toBe('gemini-3.7-flash-high')
    expect(resolved.context?.contextWindow).toBe(1000000)
    expect(resolved.inputModalities).toEqual(['text', 'image'])
  })

  it('registers configurable provider at root settings namespace', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmMowan, {})

    const configurable = ctx.llm.listConfigurableProviders()
    const hit = configurable.find(c => c.provider === 'mowan')
    expect(hit).toBeDefined()
    expect(hit).toEqual({
      provider: 'mowan',
      displayName: '魔丸',
      settingsNs: 'llm-mowan',
      settingsPath: [],
    })
  })

  it('supports custom models and config', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmMowan, {
      baseURL: 'https://custom.endpoint.example/v1',
      models: [
        { id: 'custom-model', name: 'Custom Model', contextWindow: 500000, inputModalities: ['text'] },
      ],
    })

    const models = await ctx.llm.listModels('mowan')
    expect(models).toHaveLength(1)
    expect(models[0]?.id).toBe('custom-model')
    expect(models[0]?.name).toBe('Custom Model')
    expect(models[0]?.inputModalities).toEqual(['text'])

    const resolved = await ctx.llm.resolveModelInfo('mowan', 'custom-model')
    expect(resolved.context?.contextWindow).toBe(500000)
  })

  it('resolves primary credential from credentials service', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)

    const mockCredentials = {
      resolve: (ref: unknown) => {
        if (ref === credentialRef('MOWAN_API_KEY')) {
          return Promise.resolve({ value: 'secret-mowan-key' })
        }
        return Promise.resolve(undefined)
      },
    }
    ctx.provide('credentials', mockCredentials as never)

    await ctx.plugin(LlmMowan, {})

    const call = await ctx.llm.prepareCall({ provider: 'mowan', model: 'gemini-3.7-flash-high' })
    expect(call.config.model).toBe('gemini-3.7-flash-high')
  })

  it('falls back to AAAA_API_KEY if MOWAN_API_KEY is missing', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)

    const mockCredentials = {
      resolve: (ref: unknown) => {
        if (ref === credentialRef('AAAA_API_KEY')) {
          return Promise.resolve({ value: 'secret-aaaa-key' })
        }
        return Promise.resolve(undefined)
      },
    }
    ctx.provide('credentials', mockCredentials as never)

    await ctx.plugin(LlmMowan, {})

    const call = await ctx.llm.prepareCall({ provider: 'mowan', model: 'gemini-3.7-flash-high' })
    expect(call.config.model).toBe('gemini-3.7-flash-high')
  })

  it('throws MISSING_CREDENTIAL when neither primary nor fallback key is present', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)

    const mockCredentials = {
      resolve: () => Promise.resolve(undefined),
    }
    ctx.provide('credentials', mockCredentials as never)

    await ctx.plugin(LlmMowan, {})

    const call = await ctx.llm.prepareCall({ provider: 'mowan', model: 'gemini-3.7-flash-high' })
    const streamIter = call.stream({
      ...call.config,
      messages: [{ role: 'user', content: 'hello' }],
    })

    const chunks = []
    for await (const chunk of streamIter) {
      chunks.push(chunk)
    }

    expect(
      chunks.some(
        c => c.type === 'finish' && c.reason.kind === 'error' && c.reason.failure.code === 'MISSING_CREDENTIAL',
      ),
    ).toBe(true)
  })

  it('updates models dynamically when settings update', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-mowan-settings-'))
    const settingsPath = join(dir, 'settings.yaml')

    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(FileSettingsProvider, { path: settingsPath, watch: false })
    await ctx.plugin(LlmMowan, {})

    await ctx.settings.update(settingsNamespace('llm-mowan'), {
      models: [{ id: 'dynamic-model', name: 'Dynamic Model' }],
    })

    const models = await ctx.llm.listModels('mowan')
    expect(models.map(m => m.id)).toEqual(['dynamic-model'])

    await ctx.fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  })
})
