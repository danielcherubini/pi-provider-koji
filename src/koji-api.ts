import type { KojiModel, KojiModelsResponse, PiModel, PiProviderConfig } from './types'

const DEFAULT_KOJI_URL = 'http://127.0.0.1:11434'
const KOJI_MODELS_ENDPOINT = '/koji/v1/opencode/models'

const DEFAULT_CONTEXT_WINDOW = 128000
const DEFAULT_MAX_TOKENS = 8192

/** Normalize a base URL by stripping trailing slashes and /v1 suffix. */
export function normalizeBaseURL(baseURL: string = DEFAULT_KOJI_URL): string {
  let normalized = baseURL.replace(/\/+$/, '')
  if (normalized.endsWith('/v1')) {
    normalized = normalized.slice(0, -3)
  }
  return normalized
}

/** Build a full URL from base + endpoint. */
export function buildAPIURL(baseURL: string, endpoint: string = KOJI_MODELS_ENDPOINT): string {
  const normalized = normalizeBaseURL(baseURL)
  return `${normalized}${endpoint}`
}

/** Check if koji is reachable at the given base URL. */
export async function checkKojiHealth(baseURL: string = DEFAULT_KOJI_URL): Promise<boolean> {
  try {
    const url = buildAPIURL(baseURL, KOJI_MODELS_ENDPOINT)
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    })
    return response.ok
  } catch {
    return false
  }
}

/** Auto-detect koji on common ports. Returns the base URL or null. */
export async function autoDetectKoji(): Promise<string | null> {
  const ports = [11434, 8080]
  for (const port of ports) {
    const baseURL = `http://127.0.0.1:${port}`
    const isHealthy = await checkKojiHealth(baseURL)
    if (isHealthy) {
      return baseURL
    }
  }
  return null
}

/** Fetch raw model list from koji's opencode endpoint. */
export async function fetchKojiModels(baseURL: string = DEFAULT_KOJI_URL): Promise<KojiModel[]> {
  try {
    const url = buildAPIURL(baseURL, KOJI_MODELS_ENDPOINT)
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      console.warn(`[pi-provider-koji] Koji returned ${response.status}: ${response.statusText}`)
      return []
    }

    const data = (await response.json()) as KojiModelsResponse
    return data.models ?? []
  } catch (error) {
    console.warn(
      `[pi-provider-koji] Failed to fetch models: ${error instanceof Error ? error.message : String(error)}`
    )
    return []
  }
}

/** Transform a single koji model into pi's model format. */
export function transformModel(model: KojiModel): PiModel {
  const contextWindow = model.context_length ?? model.limit?.context ?? DEFAULT_CONTEXT_WINDOW
  // Use || (not ??) so that 0 also falls through to the computed default.
  // Some providers set limit.output = 0 meaning "no explicit limit", which would
  // otherwise give pi an auto-compact threshold of contextWindow - 0 = contextWindow
  // (i.e. never compact).  contextWindow/16 is the reservation heuristic (~6%).
  const maxTokens = model.limit?.output || (Math.floor(contextWindow / 16) || DEFAULT_MAX_TOKENS)

  // Map modalities: koji uses ["text", "image"], pi uses the same format
  const validInputTypes = new Set(['text', 'image'])
  const input: ('text' | 'image')[] = model.modalities?.input?.length
    ? (model.modalities.input.filter((m) => validInputTypes.has(m)) as ('text' | 'image')[])
    : ['text']

  return {
    id: model.id,
    name: model.name || model.id,
    reasoning: false,
    input,
    contextWindow,
    maxTokens,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
  }
}

/** Transform all koji models into a complete pi provider config. */
export function buildPiProviderConfig(baseURL: string, kojiModels: KojiModel[]): PiProviderConfig {
  const normalized = normalizeBaseURL(baseURL)

  return {
    baseUrl: `${normalized}/v1`,
    api: 'openai-completions',
    apiKey: 'koji',
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
    models: kojiModels.map(transformModel),
  }
}

/**
 * Full discovery flow: detect koji, fetch models, return pi provider config.
 * Returns null if koji is not reachable or has no models.
 */
export async function discoverKojiForPi(
  kojiURL?: string
): Promise<PiProviderConfig | null> {
  let baseURL: string

  if (kojiURL) {
    baseURL = normalizeBaseURL(kojiURL)
    const isHealthy = await checkKojiHealth(baseURL)
    if (!isHealthy) {
      console.warn(`[pi-provider-koji] Koji not reachable at ${baseURL}`)
      return null
    }
  } else {
    const detected = await autoDetectKoji()
    if (!detected) {
      console.log('[pi-provider-koji] Koji not detected on default ports (11434, 8080)')
      return null
    }
    baseURL = detected
  }

  const models = await fetchKojiModels(baseURL)
  if (models.length === 0) {
    console.warn('[pi-provider-koji] No models discovered — ensure koji serve is running')
    return null
  }

  return buildPiProviderConfig(baseURL, models)
}
