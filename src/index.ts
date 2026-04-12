import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { discoverKojiForPi } from './koji-api'

const PROVIDER_NAME = 'koji'
const SETTINGS_PATH = join(homedir(), '.pi', 'agent', 'settings.json')

/** Read koji URL from ~/.pi/agent/settings.json "pi-koji" section. */
async function readSettingsURL(): Promise<string | undefined> {
  try {
    const raw = await readFile(SETTINGS_PATH, 'utf-8')
    const settings = JSON.parse(raw)
    return settings?.['pi-koji']?.url || undefined
  } catch {
    return undefined
  }
}

export default function (pi: ExtensionAPI) {
  pi.on('session_start', async (_event, ctx) => {
    // Priority: KOJI_URL env var > settings.json > auto-detect localhost
    const kojiURL = process.env.KOJI_URL || (await readSettingsURL()) || undefined
    const config = await discoverKojiForPi(kojiURL)

    if (!config) {
      return
    }

    pi.registerProvider(PROVIDER_NAME, config)

    const modelCount = config.models.length
    const names = config.models.map((m) => m.name).join(', ')
    ctx.ui.notify(`koji: ${modelCount} model(s) discovered (${names})`, 'info')
  })
}
