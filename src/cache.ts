import { readFileSync } from 'node:fs'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import type { KojiModel } from './types'

const DEFAULT_CACHE_PATH = join(homedir(), '.pi', 'agent', 'koji-models.json')

export interface ModelsCache {
  updatedAt: string
  baseURL: string
  models: KojiModel[]
}

/** Read the models cache synchronously. Returns null if missing or malformed. */
export function readModelsCacheSync(path: string = DEFAULT_CACHE_PATH): ModelsCache | null {
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<ModelsCache>
    if (
      typeof parsed.baseURL === 'string' &&
      Array.isArray(parsed.models) &&
      parsed.models.length > 0
    ) {
      return {
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
        baseURL: parsed.baseURL,
        models: parsed.models as KojiModel[],
      }
    }
    return null
  } catch {
    return null
  }
}

/** Write the models cache. Silent-fails on IO errors — caller may log. */
export async function writeModelsCache(
  baseURL: string,
  models: KojiModel[],
  path: string = DEFAULT_CACHE_PATH
): Promise<void> {
  const payload: ModelsCache = {
    updatedAt: new Date().toISOString(),
    baseURL,
    models,
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(payload, null, 2), 'utf-8')
}
