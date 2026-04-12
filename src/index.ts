import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { discoverKojiForPi } from './koji-api'

const PROVIDER_NAME = 'koji'

export default function (pi: ExtensionAPI) {
  pi.on('session_start', async (_event, ctx) => {
    const config = await discoverKojiForPi()

    if (!config) {
      return
    }

    pi.registerProvider(PROVIDER_NAME, config)

    const modelCount = config.models.length
    const names = config.models.map((m) => m.name).join(', ')
    ctx.ui.notify(`koji: ${modelCount} model(s) discovered (${names})`, 'info')
  })
}
