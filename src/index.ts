import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { discoverKojiForPi } from './koji-api'

const PROVIDER_NAME = 'koji'

export default function (pi: ExtensionAPI) {
  pi.on('session_start', async (_event, ctx) => {
    // KOJI_URL env var allows pointing to a remote koji server
    // e.g. KOJI_URL=http://myserver:11434
    const kojiURL = process.env.KOJI_URL || undefined
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
