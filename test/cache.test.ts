import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readModelsCacheSync, writeModelsCache, type ModelsCache } from '../src/cache'
import type { KojiModel } from '../src/types'

describe('models cache', () => {
  let dir: string
  let cachePath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'koji-cache-'))
    cachePath = join(dir, 'koji-models.json')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  describe('readModelsCacheSync', () => {
    it('returns null when the file does not exist', () => {
      expect(readModelsCacheSync(cachePath)).toBeNull()
    })

    it('returns null when the file is not valid JSON', () => {
      writeFileSync(cachePath, 'not json', 'utf-8')
      expect(readModelsCacheSync(cachePath)).toBeNull()
    })

    it('returns null when baseURL is missing', () => {
      writeFileSync(cachePath, JSON.stringify({ models: [{ id: 'a' }] }), 'utf-8')
      expect(readModelsCacheSync(cachePath)).toBeNull()
    })

    it('returns null when models array is empty', () => {
      writeFileSync(
        cachePath,
        JSON.stringify({ baseURL: 'http://localhost:11434', models: [] }),
        'utf-8'
      )
      expect(readModelsCacheSync(cachePath)).toBeNull()
    })

    it('returns the parsed cache when valid', () => {
      const payload: ModelsCache = {
        updatedAt: '2026-04-22T00:00:00Z',
        baseURL: 'http://localhost:11434',
        models: [{ id: 'test/model', name: 'Test Model', context_length: 8192 }] as KojiModel[],
      }
      writeFileSync(cachePath, JSON.stringify(payload), 'utf-8')

      const cache = readModelsCacheSync(cachePath)
      expect(cache).not.toBeNull()
      expect(cache!.baseURL).toBe('http://localhost:11434')
      expect(cache!.models).toHaveLength(1)
      expect(cache!.models[0]!.id).toBe('test/model')
    })
  })

  describe('writeModelsCache', () => {
    it('writes a JSON file with updatedAt, baseURL and models', async () => {
      const models: KojiModel[] = [
        { id: 'test/model', name: 'Test', context_length: 8192 },
      ]
      await writeModelsCache('http://localhost:11434', models, cachePath)

      expect(existsSync(cachePath)).toBe(true)
      const parsed = JSON.parse(readFileSync(cachePath, 'utf-8')) as ModelsCache
      expect(parsed.baseURL).toBe('http://localhost:11434')
      expect(parsed.models).toEqual(models)
      expect(typeof parsed.updatedAt).toBe('string')
      expect(new Date(parsed.updatedAt).toString()).not.toBe('Invalid Date')
    })

    it('creates the parent directory if it does not exist', async () => {
      const nestedPath = join(dir, 'nested', 'dir', 'koji-models.json')
      await writeModelsCache('http://localhost:11434', [{ id: 'a' }] as KojiModel[], nestedPath)
      expect(existsSync(nestedPath)).toBe(true)
    })

    it('round-trips through readModelsCacheSync', async () => {
      const models: KojiModel[] = [
        { id: 'test/model', name: 'Test', context_length: 8192 },
      ]
      await writeModelsCache('http://koji:11434', models, cachePath)
      const cache = readModelsCacheSync(cachePath)
      expect(cache!.baseURL).toBe('http://koji:11434')
      expect(cache!.models).toEqual(models)
    })
  })
})
