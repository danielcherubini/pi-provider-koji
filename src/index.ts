import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { discoverKojiForPi, normalizeBaseURL } from './koji-api'

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
  // scope resolution. This lets pi find and select a koji model as the default.
  // We use conservative estimates for contextWindow/maxTokens — the real values
  // will be updated after session_start when we fetch actual data from koji.
  try {
    const raw = readFileSync(SETTINGS_PATH, 'utf-8')
    const settings = JSON.parse(raw)
    const kojiURL = settings?.['pi-provider-koji']?.url
    const kojiModelIds = collectPreRegisterModels(settings)

    if (kojiURL && kojiModelIds.length > 0) {
      pi.registerProvider(PROVIDER_NAME, {
        baseUrl: `${normalizeBaseURL(kojiURL)}/v1`,
        api: 'openai-completions',
        apiKey: 'koji',
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
  } catch {
    // Ignore errors during pre-registration
  }

  pi.on('session_start', async (_event, ctx) => {
    // Priority: KOJI_URL env var > settings.json > auto-detect localhost
    const kojiURL = process.env.KOJI_URL || (await readSettingsURL()) || undefined
    const config = await discoverKojiForPi(kojiURL)

    if (!config) {
      return
    }

    // Re-register with real model data from koji. This replaces the sync
    // pre-registered models (with hardcoded contextWindow) with accurate data.
    pi.registerProvider(PROVIDER_NAME, config)

    // After re-registration, the session's model reference may still point to a
    // stale model object from the sync pre-registration (which used hardcoded
    // contextWindow: 128000). Look up the real Model from the registry — which
    // now has correct contextWindow values — and update the session. This ensures
    // _checkCompaction reads the right threshold.
    const currentModel = ctx.model
    if (currentModel && currentModel.provider === PROVIDER_NAME) {
      const realModel = ctx.modelRegistry.find(PROVIDER_NAME, currentModel.id)
      if (realModel && realModel.contextWindow !== currentModel.contextWindow) {
        // pi.setModel() updates agent.state.model, which is what _checkCompaction
        // reads via this.model?.contextWindow.
        pi.setModel(realModel)
      }
    }
  })
}
