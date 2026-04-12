import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  normalizeBaseURL,
  buildAPIURL,
  transformModel,
  buildPiProviderConfig,
  checkKojiHealth,
  fetchKojiModels,
  autoDetectKoji,
  discoverKojiForPi,
} from '../src/koji-api'
import type { KojiModel } from '../src/types'

// ---------- Pure function tests (no network) ----------

describe('normalizeBaseURL', () => {
  it('strips trailing slashes', () => {
    expect(normalizeBaseURL('http://localhost:11434/')).toBe('http://localhost:11434')
    expect(normalizeBaseURL('http://localhost:11434///')).toBe('http://localhost:11434')
  })

  it('strips /v1 suffix', () => {
    expect(normalizeBaseURL('http://localhost:11434/v1')).toBe('http://localhost:11434')
  })

  it('strips trailing slash then /v1', () => {
    expect(normalizeBaseURL('http://localhost:11434/v1/')).toBe('http://localhost:11434')
  })

  it('returns unchanged URL when no suffix', () => {
    expect(normalizeBaseURL('http://localhost:11434')).toBe('http://localhost:11434')
  })

  it('uses default when no argument', () => {
    expect(normalizeBaseURL()).toBe('http://127.0.0.1:11434')
  })
})

describe('buildAPIURL', () => {
  it('builds the default opencode models URL', () => {
    expect(buildAPIURL('http://localhost:11434')).toBe(
      'http://localhost:11434/koji/v1/opencode/models'
    )
  })

  it('normalizes before building', () => {
    expect(buildAPIURL('http://localhost:11434/v1/')).toBe(
      'http://localhost:11434/koji/v1/opencode/models'
    )
  })

  it('accepts a custom endpoint', () => {
    expect(buildAPIURL('http://localhost:11434', '/health')).toBe(
      'http://localhost:11434/health'
    )
  })
})

describe('transformModel', () => {
  const baseModel: KojiModel = {
    id: 'unsloth/qwen3.5-35b-a3b-gguf',
    name: 'Unsloth: Qwen3.5 35B A3B',
  }

  it('transforms a minimal model', () => {
    const result = transformModel(baseModel)
    expect(result).toEqual({
      id: 'unsloth/qwen3.5-35b-a3b-gguf',
      name: 'Unsloth: Qwen3.5 35B A3B',
      reasoning: false,
      input: ['text'],
      contextWindow: 128000,
      maxTokens: 8000,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    })
  })

  it('uses context_length when provided', () => {
    const model: KojiModel = { ...baseModel, context_length: 262144 }
    const result = transformModel(model)
    expect(result.contextWindow).toBe(262144)
    expect(result.maxTokens).toBe(Math.floor(262144 / 16))
  })

  it('uses limit.context when context_length is null', () => {
    const model: KojiModel = {
      ...baseModel,
      context_length: null,
      limit: { context: 65536, output: 4096 },
    }
    const result = transformModel(model)
    expect(result.contextWindow).toBe(65536)
    expect(result.maxTokens).toBe(4096)
  })

  it('prefers limit.output over computed maxTokens', () => {
    const model: KojiModel = {
      ...baseModel,
      context_length: 131072,
      limit: { context: 131072, output: 16384 },
    }
    const result = transformModel(model)
    expect(result.maxTokens).toBe(16384)
  })

  it('maps modalities', () => {
    const model: KojiModel = {
      ...baseModel,
      modalities: { input: ['text', 'image'], output: ['text'] },
    }
    const result = transformModel(model)
    expect(result.input).toEqual(['text', 'image'])
  })

  it('defaults to ["text"] when modalities are absent', () => {
    const result = transformModel(baseModel)
    expect(result.input).toEqual(['text'])
  })

  it('falls back to id when name is empty', () => {
    const model: KojiModel = { id: 'test/model', name: '' }
    const result = transformModel(model)
    expect(result.name).toBe('test/model')
  })

  it('always sets reasoning to false', () => {
    const result = transformModel(baseModel)
    expect(result.reasoning).toBe(false)
  })

  it('always sets cost to zero', () => {
    const result = transformModel(baseModel)
    expect(result.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
  })
})

describe('buildPiProviderConfig', () => {
  const models: KojiModel[] = [
    {
      id: 'unsloth/qwen3.5-35b-a3b-gguf',
      name: 'Unsloth: Qwen3.5 35B A3B',
      context_length: 262144,
    },
    {
      id: 'mudler/deltacoder-9b-gguf',
      name: 'Mudler: Deltacoder 9B',
      context_length: 131072,
      modalities: { input: ['text', 'image'], output: ['text'] },
    },
  ]

  it('builds a complete pi provider config', () => {
    const config = buildPiProviderConfig('http://127.0.0.1:11434', models)

    expect(config.baseUrl).toBe('http://127.0.0.1:11434/v1')
    expect(config.api).toBe('openai-completions')
    expect(config.apiKey).toBe('koji')
    expect(config.compat).toEqual({
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    })
    expect(config.models).toHaveLength(2)
    expect(config.models[0]!.id).toBe('unsloth/qwen3.5-35b-a3b-gguf')
    expect(config.models[1]!.input).toEqual(['text', 'image'])
  })

  it('normalizes the base URL before appending /v1', () => {
    const config = buildPiProviderConfig('http://localhost:11434/v1/', models)
    expect(config.baseUrl).toBe('http://localhost:11434/v1')
  })
})

// ---------- Network tests (mocked fetch) ----------

describe('checkKojiHealth', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true when koji responds 200', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('OK', { status: 200 }))
    expect(await checkKojiHealth('http://localhost:11434')).toBe(true)
  })

  it('returns false when koji responds 500', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Error', { status: 500 }))
    expect(await checkKojiHealth('http://localhost:11434')).toBe(false)
  })

  it('returns false when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Connection refused'))
    expect(await checkKojiHealth('http://localhost:11434')).toBe(false)
  })
})

describe('fetchKojiModels', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns models on success', async () => {
    const body: { models: KojiModel[] } = {
      models: [
        { id: 'test/model', name: 'Test Model', context_length: 8192 },
      ],
    }
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const models = await fetchKojiModels('http://localhost:11434')
    expect(models).toHaveLength(1)
    expect(models[0]!.id).toBe('test/model')
  })

  it('returns empty array on non-200', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Not Found', { status: 404 }))
    const models = await fetchKojiModels('http://localhost:11434')
    expect(models).toEqual([])
  })

  it('returns empty array on fetch error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('timeout'))
    const models = await fetchKojiModels('http://localhost:11434')
    expect(models).toEqual([])
  })

  it('returns empty array when response has no models key', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const models = await fetchKojiModels('http://localhost:11434')
    expect(models).toEqual([])
  })
})

describe('autoDetectKoji', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns first healthy port', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('OK', { status: 200 }))
    const url = await autoDetectKoji()
    expect(url).toBe('http://127.0.0.1:11434')
  })

  it('tries port 8080 when 11434 is down', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('refused')) // port 11434
      .mockResolvedValueOnce(new Response('OK', { status: 200 })) // port 8080

    const url = await autoDetectKoji()
    expect(url).toBe('http://127.0.0.1:8080')
  })

  it('returns null when no ports respond', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('refused'))
    const url = await autoDetectKoji()
    expect(url).toBeNull()
  })
})

describe('discoverKojiForPi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns full pi config on successful discovery', async () => {
    const body = {
      models: [
        {
          id: 'unsloth/qwen3.5-35b-a3b-gguf',
          name: 'Unsloth: Qwen3.5 35B A3B',
          context_length: 262144,
          modalities: { input: ['text', 'image'], output: ['text'] },
        },
      ],
    }

    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const config = await discoverKojiForPi('http://localhost:11434')
    expect(config).not.toBeNull()
    expect(config!.baseUrl).toBe('http://localhost:11434/v1')
    expect(config!.models).toHaveLength(1)
    expect(config!.models[0]!.id).toBe('unsloth/qwen3.5-35b-a3b-gguf')
    expect(config!.models[0]!.input).toEqual(['text', 'image'])
    expect(config!.models[0]!.contextWindow).toBe(262144)
  })

  it('returns null when koji is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('refused'))
    const config = await discoverKojiForPi('http://localhost:11434')
    expect(config).toBeNull()
  })

  it('returns null when no models are available', async () => {
    vi.mocked(fetch)
      // Health check succeeds
      .mockResolvedValueOnce(new Response('OK', { status: 200 }))
      // But models endpoint returns empty
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

    const config = await discoverKojiForPi('http://localhost:11434')
    expect(config).toBeNull()
  })

  it('auto-detects when no URL is provided', async () => {
    const body = {
      models: [{ id: 'test/model', name: 'Test', context_length: 8192 }],
    }

    // Auto-detect health check on port 11434
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const config = await discoverKojiForPi()
    expect(config).not.toBeNull()
    expect(config!.baseUrl).toBe('http://127.0.0.1:11434/v1')
  })
})
