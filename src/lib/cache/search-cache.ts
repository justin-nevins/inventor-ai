// Search Results Cache
// - Patents: Never expire (patents are permanent public records)
// - Web/Retail: Storage limit based (keep last N results per query type)

import { createClient } from '@/lib/supabase/server'

export interface CachedSearchResult {
  id: string
  query_hash: string
  search_type: 'patent' | 'web' | 'retail'
  query_params: Record<string, unknown>
  results: unknown[]
  result_count: number
  source_api: string
  created_at: string
  expires_at: string | null // null = never expires
}

interface SearchCacheInsert {
  query_hash: string
  search_type: 'patent' | 'web' | 'retail'
  query_params: Record<string, unknown>
  results: unknown[]
  result_count: number
  source_api: string
  expires_at: string | null
}

// Storage limits (keep last N results per type)
const STORAGE_LIMITS = {
  patent: Infinity, // Never delete patent results
  web: 1000, // Keep last 1000 web searches
  retail: 1000, // Keep last 1000 retail searches
} as const

/**
 * Generates a hash for cache key from query parameters
 */
export function generateQueryHash(searchType: string, params: Record<string, unknown>): string {
  const normalized = JSON.stringify(params, Object.keys(params).sort())
  // Simple hash function for cache key
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return `${searchType}_${Math.abs(hash).toString(36)}`
}

/**
 * Get cached search results if available
 */
export async function getCachedResults(
  searchType: 'patent' | 'web' | 'retail',
  queryParams: Record<string, unknown>
): Promise<CachedSearchResult | null> {
  try {
    const supabase = await createClient()
    const queryHash = generateQueryHash(searchType, queryParams)

    const { data, error } = await supabase
      .from('search_cache')
      .select('*')
      .eq('query_hash', queryHash)
      .eq('search_type', searchType)
      .single() as { data: CachedSearchResult | null; error: unknown }

    if (error || !data) {
      return null
    }

    // Check if expired (for non-patent searches)
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      // Result expired, delete and return null
      await supabase.from('search_cache').delete().eq('id', data.id)
      return null
    }

    return data
  } catch {
    return null
  }
}

/**
 * Store search results in cache
 */
export async function cacheSearchResults(
  searchType: 'patent' | 'web' | 'retail',
  queryParams: Record<string, unknown>,
  results: unknown[],
  sourceApi: string
): Promise<void> {
  try {
    const supabase = await createClient()
    const queryHash = generateQueryHash(searchType, queryParams)

    // For patents: never expire
    // For web/retail: set 7-day expiry as backup, but mainly rely on storage limits
    const expiresAt = searchType === 'patent'
      ? null
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    // Upsert the cache entry
    const cacheData: SearchCacheInsert = {
      query_hash: queryHash,
      search_type: searchType,
      query_params: queryParams,
      results: results,
      result_count: results.length,
      source_api: sourceApi,
      expires_at: expiresAt,
    }
    await supabase.from('search_cache').upsert(cacheData as never, {
      onConflict: 'query_hash',
    })

    // Enforce storage limits for non-patent searches
    if (searchType !== 'patent') {
      await enforceStorageLimit(searchType)
    }
  } catch (error) {
    console.error('Failed to cache search results:', error)
    // Don't throw - caching failure shouldn't break the search
  }
}

/**
 * Enforce storage limits by deleting oldest entries
 */
async function enforceStorageLimit(
  searchType: 'web' | 'retail'
): Promise<void> {
  try {
    const supabase = await createClient()
    const limit = STORAGE_LIMITS[searchType]

    // Get count of entries for this type
    const { count } = await supabase
      .from('search_cache')
      .select('*', { count: 'exact', head: true })
      .eq('search_type', searchType)

    if (!count || count <= limit) {
      return
    }

    // Delete oldest entries beyond the limit
    const toDelete = count - limit

    // Get IDs of oldest entries
    const { data: oldEntries } = await supabase
      .from('search_cache')
      .select('id')
      .eq('search_type', searchType)
      .order('created_at', { ascending: true })
      .limit(toDelete) as { data: { id: string }[] | null }

    if (oldEntries && oldEntries.length > 0) {
      const idsToDelete = oldEntries.map(e => e.id)
      await supabase
        .from('search_cache')
        .delete()
        .in('id', idsToDelete)
    }
  } catch (error) {
    console.error('Failed to enforce storage limit:', error)
  }
}

/**
 * Clear all cached results for a specific type
 */
export async function clearCache(searchType?: 'patent' | 'web' | 'retail'): Promise<void> {
  try {
    const supabase = await createClient()

    if (searchType) {
      await supabase.from('search_cache').delete().eq('search_type', searchType)
    } else {
      await supabase.from('search_cache').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    }
  } catch (error) {
    console.error('Failed to clear cache:', error)
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  patent: { count: number; oldest?: string }
  web: { count: number; oldest?: string }
  retail: { count: number; oldest?: string }
}> {
  try {
    const supabase = await createClient()

    const stats = {
      patent: { count: 0, oldest: undefined as string | undefined },
      web: { count: 0, oldest: undefined as string | undefined },
      retail: { count: 0, oldest: undefined as string | undefined },
    }

    for (const type of ['patent', 'web', 'retail'] as const) {
      const { count } = await supabase
        .from('search_cache')
        .select('*', { count: 'exact', head: true })
        .eq('search_type', type)

      const { data: oldest } = await supabase
        .from('search_cache')
        .select('created_at')
        .eq('search_type', type)
        .order('created_at', { ascending: true })
        .limit(1)
        .single() as { data: { created_at: string } | null }

      stats[type] = {
        count: count || 0,
        oldest: oldest?.created_at,
      }
    }

    return stats
  } catch {
    return {
      patent: { count: 0 },
      web: { count: 0 },
      retail: { count: 0 },
    }
  }
}
