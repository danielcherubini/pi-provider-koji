/** Model as returned by koji's /koji/v1/opencode/models endpoint. */
export interface KojiModel {
  id: string
  name: string
  model?: string
  backend?: string
  context_length?: number | null
  limit?: {
    context: number | null
    output: number | null
  }
  modalities?: {
    input: string[]
    output: string[]
  }
  quant?: string
  gpu_layers?: number
}

/** Response from koji's /koji/v1/opencode/models endpoint. */
export interface KojiModelsResponse {
  models: KojiModel[]
}

/** A model in pi's provider format. */
export interface PiModel {
  id: string
  name: string
  reasoning: boolean
  input: string[]
  contextWindow: number
  maxTokens: number
  cost: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
  }
}

/** Pi provider configuration passed to pi.registerProvider(). */
export interface PiProviderConfig {
  baseUrl: string
  api: string
  apiKey: string
  compat: {
    supportsDeveloperRole: boolean
    supportsReasoningEffort: boolean
  }
  models: PiModel[]
}
