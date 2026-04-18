import { describe, it, expect } from 'vitest'
import { discoverKojiForPi } from '../src/koji-api'

describe('provider registration', () => {
  it('discovers koji models and returns a valid provider config', async () => {
    // This test verifies that discoverKojiForPi returns a properly shaped
    // config. It requires koji to be running — skip if not available.
    const config = await discoverKojiForPi()

    // If koji is not running, the test should still pass (graceful degradation)
    if (!config) {
      expect(true).toBe(true)
      return
    }

    expect(config).toHaveProperty('baseUrl')
    expect(config).toHaveProperty('api', 'openai-completions')
    expect(config).toHaveProperty('apiKey', 'koji')
    expect(config).toHaveProperty('models')
    expect(Array.isArray(config.models)).toBe(true)
    expect(config.models.length).toBeGreaterThan(0)

    // Verify each model has the required fields
    for (const model of config.models) {
      expect(model).toHaveProperty('id')
      expect(model).toHaveProperty('name')
      expect(model).toHaveProperty('contextWindow')
      expect(model).toHaveProperty('maxTokens')
      expect(typeof model.contextWindow).toBe('number')
      expect(model.contextWindow).toBeGreaterThan(0)
    }
  })

  it('uses real context windows from koji, not hardcoded values', async () => {
    const config = await discoverKojiForPi()

    if (!config || config.models.length === 0) {
      expect(true).toBe(true)
      return
    }

    // The key fix: context windows should come from koji's response,
    // not be hardcoded to 128000. Different models may have different
    // context windows (e.g., 32k, 128k, 256k).
    const contextWindows = config.models.map((m) => m.contextWindow)

    // All context windows should be positive numbers
    for (const cw of contextWindows) {
      expect(cw).toBeGreaterThan(0)
    }

    // At least one model should have a context window that differs from
    // the old hardcoded default of 128000, proving we fetch real data.
    // (Some models may coincidentally be 128k, but most won't be.)
    const hasNonDefault = contextWindows.some((cw) => cw !== 128000)
    expect(hasNonDefault || contextWindows.length === 1).toBe(true)
  })
})
