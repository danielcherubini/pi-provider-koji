import { describe, it, expect } from 'vitest'
import { collectPreRegisterModels } from '../src/index'

describe('collectPreRegisterModels', () => {
  it('returns empty list for null/undefined/non-object', () => {
    expect(collectPreRegisterModels(null)).toEqual([])
    expect(collectPreRegisterModels(undefined)).toEqual([])
    expect(collectPreRegisterModels('nope')).toEqual([])
    expect(collectPreRegisterModels(42)).toEqual([])
  })

  it('returns empty list when nothing koji-related is configured', () => {
    expect(collectPreRegisterModels({})).toEqual([])
    expect(
      collectPreRegisterModels({
        defaultProvider: 'anthropic',
        defaultModel: 'claude-opus-4-6',
      })
    ).toEqual([])
  })

  it('strips the koji/ prefix from enabledModels entries', () => {
    expect(
      collectPreRegisterModels({
        enabledModels: ['koji/unsloth/gemma-4-26b-a4b-it-gguf'],
      })
    ).toEqual(['unsloth/gemma-4-26b-a4b-it-gguf'])
  })

  it('ignores enabledModels entries for other providers', () => {
    expect(
      collectPreRegisterModels({
        enabledModels: [
          'anthropic/claude-opus-4-6',
          'openrouter/qwen/qwen3.5-flash',
          'koji/mudler/deltacoder-9b-gguf',
        ],
      })
    ).toEqual(['mudler/deltacoder-9b-gguf'])
  })

  it('includes defaultModel when defaultProvider is koji', () => {
    expect(
      collectPreRegisterModels({
        defaultProvider: 'koji',
        defaultModel: 'unsloth/gemma-4-26b-a4b-it-gguf',
      })
    ).toEqual(['unsloth/gemma-4-26b-a4b-it-gguf'])
  })

  it('does not include defaultModel when defaultProvider is not koji', () => {
    expect(
      collectPreRegisterModels({
        defaultProvider: 'anthropic',
        defaultModel: 'unsloth/gemma-4-26b-a4b-it-gguf',
      })
    ).toEqual([])
  })

  it('merges enabledModels and defaultModel without duplicates', () => {
    expect(
      collectPreRegisterModels({
        defaultProvider: 'koji',
        defaultModel: 'unsloth/gemma-4-26b-a4b-it-gguf',
        enabledModels: [
          'koji/unsloth/gemma-4-26b-a4b-it-gguf',
          'koji/mudler/deltacoder-9b-gguf',
        ],
      })
    ).toEqual([
      'unsloth/gemma-4-26b-a4b-it-gguf',
      'mudler/deltacoder-9b-gguf',
    ])
  })

  it('ignores non-string entries in enabledModels', () => {
    expect(
      collectPreRegisterModels({
        enabledModels: [
          'koji/a',
          null,
          42,
          { nope: true },
          'koji/b',
        ],
      })
    ).toEqual(['a', 'b'])
  })

  it('ignores empty or non-string defaultModel', () => {
    expect(
      collectPreRegisterModels({
        defaultProvider: 'koji',
        defaultModel: '',
      })
    ).toEqual([])
    expect(
      collectPreRegisterModels({
        defaultProvider: 'koji',
        defaultModel: 123,
      })
    ).toEqual([])
  })
})
