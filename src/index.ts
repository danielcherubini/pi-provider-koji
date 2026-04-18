import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { discoverKojiForPi } from './koji-api'

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

export default function (pi: ExtensionAPI) {
  // Register koji provider on session_start with real model data from koji.
  //
  // We deliberately skip synchronous pre-registration because it uses hardcoded
  // contextWindow values (128000) that don't match the real models served by
  // koji. This causes compaction to trigger at the wrong threshold — e.g. if a
  // user's model has a 32k context window, compaction would only fire at ~111k
  // tokens instead of ~15k. By deferring registration until session_start, we
  // ensure the provider is registered with accurate values before any
  // _checkCompaction call.
  //
  // After re-registration, we also update the session's model reference to use
  // the real model from the registry (in case it was previously selected with
  // stale contextWindow data).
  //
  // Note: Koji models are not available during initial scope resolution. If no
  // other providers are configured, pi may select a different model or fail at
  // startup. Users should ensure koji is running and accessible.
  pi.on('session_start', async (_event, ctx) => {
    // Priority: KOJI_URL env var > settings.json > auto-detect localhost
    const kojiURL = process.env.KOJI_URL || (await readSettingsURL()) || undefined
    const config = await discoverKojiForPi(kojiURL)

    if (!config) {
      return
    }

    pi.registerProvider(PROVIDER_NAME, config)

    // After re-registration, the session's model reference may still point to a
    // stale model object (e.g. from pre-registration with hardcoded values).
    // Look up the real Model from the registry (which has correct contextWindow)
    // and update the session so compaction uses the right threshold.
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
