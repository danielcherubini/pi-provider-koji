import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { buildPiProviderConfig, normalizeBaseURL, resolveAndFetch } from './koji-api'
import { readModelsCacheSync, writeModelsCache } from './cache'

const PROVIDER_NAME = 'koji'
const SETTINGS_PATH = join(homedir(), '.pi', 'agent', 'settings.json')

/** Read koji URL from ~/.pi/agent/settings.json "pi-provider-koji" section. */
async function readSettingsURL(): Promise<string | undefined> {
  try {
    const raw = await readFile(SETTINGS_PATH, 'utf-8')
    const settings = JSON.parse(raw)
    return settings?.['pi-provider-koji']?.url || undefined
  } catch {
    return undefined
  }
}

/** Read koji token from ~/.pi/agent/settings.json "pi-provider-koji" section. */
async function readSettingsToken(): Promise<string | undefined> {
  try {
    const raw = await readFile(SETTINGS_PATH, 'utf-8')
    const settings = JSON.parse(raw)
    return settings?.['pi-provider-koji']?.token || undefined
  } catch {
    return undefined
  }
}

/**
 * Determine which koji model IDs should be pre-registered synchronously so they
 * exist in the registry before pi computes its initial scope. Includes:
 *  - entries in `enabledModels` that start with "koji/"
 *  - `defaultModel` when `defaultProvider === "koji"` (an implicit enabled model)
 */
export function collectPreRegisterModels(settings: unknown): string[] {
  if (!settings || typeof settings !== 'object') return []
  const s = settings as Record<string, unknown>
  const ids = new Set<string>()

  const enabled = Array.isArray(s.enabledModels) ? s.enabledModels : []
  const prefix = `${PROVIDER_NAME}/`
  for (const entry of enabled) {
    if (typeof entry === 'string' && entry.startsWith(prefix)) {
      ids.add(entry.slice(prefix.length))
    }
  }

  if (
    s.defaultProvider === PROVIDER_NAME &&
    typeof s.defaultModel === 'string' &&
    s.defaultModel.length > 0
  ) {
    ids.add(s.defaultModel)
  }

  return [...ids]
}

export default function (pi: ExtensionAPI) {
  // Synchronous pre-registration so koji models are available during initial
  // scope resolution. Priority:
  //   1. models cache from last run (accurate contextWindow, full model list)
  //   2. enabledModels from settings.json with conservative defaults (first run)
  try {
    const raw = readFileSync(SETTINGS_PATH, 'utf-8')
    const settings = JSON.parse(raw)
    const kojiURL = settings?.['pi-provider-koji']?.url
    const kojiToken = process.env.KOJI_TOKEN || settings?.['pi-provider-koji']?.token || undefined

    const cache = readModelsCacheSync()
    const effectiveURL = kojiURL || cache?.baseURL

    if (effectiveURL && cache && cache.models.length > 0) {
      // Preferred path: register every model we saw last time, with real metadata.
      pi.registerProvider(PROVIDER_NAME, buildPiProviderConfig(effectiveURL, cache.models, kojiToken))
    } else {
      // Fallback (first run, before cache exists): pre-register only the models
      // the user has enabled, with conservative context/maxTokens estimates that
      // session_start will refresh once real data is fetched.
      const kojiModelIds = collectPreRegisterModels(settings)
      if (kojiURL && kojiModelIds.length > 0) {
        pi.registerProvider(PROVIDER_NAME, {
          baseUrl: `${normalizeBaseURL(kojiURL)}/v1`,
          api: 'openai-completions',
          apiKey: kojiToken || 'koji',
          models: kojiModelIds.map((id) => ({
            id,
            name: id,
            reasoning: false,
            input: ['text'] as ('text' | 'image')[],
            contextWindow: 128000,
            maxTokens: 8192,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
          })),
        })
      }
    }
  } catch {
    // Ignore errors during pre-registration
  }

  pi.on('session_start', async (_event, ctx) => {
    // Priority: KOJI_URL env var > settings.json > auto-detect localhost
    const kojiURL = process.env.KOJI_URL || (await readSettingsURL()) || undefined
    // Token priority: KOJI_TOKEN env var > settings.json > undefined
    const kojiToken = process.env.KOJI_TOKEN || (await readSettingsToken()) || undefined

    const data = await resolveAndFetch(kojiURL, kojiToken)
    if (!data) {
      return
    }

    // Re-register with real model data from koji. This replaces the sync
    // pre-registered models (cache or conservative defaults) with fresh data.
    const config = buildPiProviderConfig(data.baseURL, data.models, kojiToken)
    pi.registerProvider(PROVIDER_NAME, config)

    // Persist so the next startup can pre-register with accurate metadata even
    // before session_start fires (and even if koji is offline at that point).
    writeModelsCache(data.baseURL, data.models).catch((err) => {
      console.warn(
        `[pi-provider-koji] Failed to write models cache: ${err instanceof Error ? err.message : String(err)}`
      )
    })

    // After re-registration, the session's model reference may still point to a
    // stale model object from the sync pre-registration. Look up the real Model
    // from the registry and update the session so _checkCompaction reads the
    // right threshold.
    const currentModel = ctx.model
    if (currentModel && currentModel.provider === PROVIDER_NAME) {
      const realModel = ctx.modelRegistry.find(PROVIDER_NAME, currentModel.id)
      if (realModel && realModel.contextWindow !== currentModel.contextWindow) {
        pi.setModel(realModel)
      }
    }
  })
}
