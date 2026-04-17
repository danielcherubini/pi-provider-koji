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
 * Determine which koji model IDs must be pre-registered synchronously so they
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
  // Synchronous pre-registration to prevent race condition with scoped models.
  // We read settings.json and register any koji models mentioned in
  // `enabledModels` OR the implicit `defaultModel` (when `defaultProvider` is
  // "koji") so they exist in the registry when pi computes the initial scope.
  try {
    const raw = readFileSync(SETTINGS_PATH, 'utf-8')
    const settings = JSON.parse(raw)
    const kojiURL = settings?.['pi-provider-koji']?.url
    const kojiModelsIds = collectPreRegisterModels(settings)

    if (kojiURL && kojiModelsIds.length > 0) {
      pi.registerProvider(PROVIDER_NAME, {
        baseUrl: `${normalizeBaseURL(kojiURL)}/v1`,
        api: 'openai-completions',
        apiKey: 'koji',
        compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
        models: kojiModelsIds.map((id) => ({
          id,
          name: id,
          reasoning: false,
          input: ['text'] as ('text' | 'image')[],
          contextWindow: 128000,
          maxTokens: 8192,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
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

    pi.registerProvider(PROVIDER_NAME, config)

  })
}
