// Brave Search API Client
// Provides real web search results for novelty checking

export interface BraveSearchResult {
  title: string
  description: string
  url: string
  age?: string // e.g., "2 days ago"
  language?: string
  family_friendly?: boolean
}

export interface BraveSearchResponse {
  query: string
  results: BraveSearchResult[]
  total_results?: number
  error?: string
}

interface BraveAPIWebResult {
  title: string
  description: string
  url: string
  age?: string
  language?: string
  family_friendly?: boolean
  extra_snippets?: string[]
}

interface BraveAPIResponse {
  query: {
    original: string
  }
  web?: {
    results: BraveAPIWebResult[]
  }
  mixed?: {
    main: Array<{ type: string; index: number }>
  }
}

const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search'

/**
 * Search the web using Brave Search API
 * @param query - Search query string
 * @param count - Number of results to return (default: 10, max: 20)
 * @returns Search results with title, description, and URL
 */
export async function braveSearch(
  query: string,
  count: number = 10
): Promise<BraveSearchResponse> {
  const apiKey = process.env.BRAVE_API_KEY

  // Debug: Log key presence and length (not the actual key!)
  const keyInfo = apiKey
    ? `Key present (${apiKey.length} chars, starts with ${apiKey.substring(0, 4)}...)`
    : 'Key NOT SET'
  console.log(`[Brave API] ${keyInfo}, query: "${query}"`)

  if (!apiKey) {
    console.error('[Brave API] BRAVE_API_KEY environment variable is not set')
    return {
      query,
      results: [],
      error: 'BRAVE_API_KEY environment variable is not set',
    }
  }

  try {
    const params = new URLSearchParams({
      q: query,
      count: Math.min(count, 20).toString(),
      text_decorations: 'false', // Remove HTML formatting
      search_lang: 'en',
    })

    const url = `${BRAVE_API_URL}?${params}`
    console.log(`[Brave API] Fetching: ${url}`)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    })

    // Debug: Log response status and headers
    console.log(`[Brave API] Response status: ${response.status} ${response.statusText}`)
    const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining')
    const rateLimitLimit = response.headers.get('X-RateLimit-Limit')
    if (rateLimitRemaining || rateLimitLimit) {
      console.log(`[Brave API] Rate limit: ${rateLimitRemaining}/${rateLimitLimit} remaining`)
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Brave API] Error response body: ${errorText}`)

      // Handle specific error codes
      if (response.status === 401) {
        return {
          query,
          results: [],
          error: `Invalid Brave API key (401). Key length: ${apiKey.length}. Response: ${errorText.substring(0, 200)}`,
        }
      }

      if (response.status === 429) {
        return {
          query,
          results: [],
          error: `Brave API rate limit exceeded (429). Response: ${errorText.substring(0, 200)}`,
        }
      }

      return {
        query,
        results: [],
        error: `Brave API error (${response.status}): ${errorText.substring(0, 200)}`,
      }
    }

    console.log(`[Brave API] Success! Parsing response...`)

    const data: BraveAPIResponse = await response.json()

    // Extract web results
    const webResults = data.web?.results || []

    const results: BraveSearchResult[] = webResults.map((result) => ({
      title: result.title,
      description: result.description || result.extra_snippets?.[0] || '',
      url: result.url,
      age: result.age,
      language: result.language,
      family_friendly: result.family_friendly,
    }))

    return {
      query: data.query?.original || query,
      results,
      total_results: webResults.length,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Brave Search API error:', errorMessage)

    return {
      query,
      results: [],
      error: `Failed to fetch search results: ${errorMessage}`,
    }
  }
}

/**
 * Generate multiple search queries for comprehensive novelty checking
 * @param inventionName - Name of the invention
 * @param description - Description of the invention
 * @param problemStatement - Problem the invention solves
 * @param keyFeatures - Key features of the invention
 * @returns Array of search queries to run
 */
export function generateNoveltySearchQueries(
  inventionName: string,
  description: string,
  problemStatement?: string,
  keyFeatures?: string[]
): string[] {
  const queries: string[] = []

  // Direct name search
  queries.push(inventionName)

  // Problem + solution search
  if (problemStatement) {
    queries.push(`${problemStatement} solution product`)
  }

  // Description-based search (extract key terms)
  const descriptionKeywords = extractKeywords(description)
  if (descriptionKeywords) {
    queries.push(`${descriptionKeywords} product`)
  }

  // Feature-based search (use top 2 features)
  if (keyFeatures && keyFeatures.length > 0) {
    const topFeatures = keyFeatures.slice(0, 2).join(' ')
    queries.push(`${topFeatures} device gadget`)
  }

  // "Buy" intent search to find existing products
  queries.push(`buy ${inventionName}`)

  return queries.slice(0, 2) // Limit to 2 queries to preserve rate limits (2000/month free tier)
}

/**
 * Extract key terms from a description
 */
function extractKeywords(text: string): string {
  // Remove common words and extract meaningful terms
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
    'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which',
    'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
    'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
    'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and',
    'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of', 'at',
    'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up',
    'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further',
    'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'any',
    'our', 'your', 'their', 'its', 'my', 'his', 'her'
  ])

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word))

  // Return first 5 unique keywords
  const uniqueWords = [...new Set(words)]
  return uniqueWords.slice(0, 5).join(' ')
}

/**
 * Run multiple searches and aggregate results
 * @param queries - Array of search queries
 * @param resultsPerQuery - Number of results per query
 * @returns Aggregated unique results
 */
// Helper to add delay between API calls
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function runMultipleSearches(
  queries: string[],
  resultsPerQuery: number = 5
): Promise<BraveSearchResponse> {
  const allResults: BraveSearchResult[] = []
  const seenUrls = new Set<string>()
  let lastError: string | undefined

  for (let i = 0; i < queries.length; i++) {
    // Add 1.2 second delay between requests to respect Brave's free tier rate limit (1 req/sec)
    if (i > 0) {
      console.log('[Brave API] Waiting 1.2s to respect rate limit...')
      await delay(1200)
    }

    const query = queries[i]
    const response = await braveSearch(query, resultsPerQuery)

    if (response.error) {
      lastError = response.error
      // If API key issue or rate limit, stop immediately
      if (response.error.includes('API key') || response.error.includes('rate limit')) {
        return response
      }
      continue
    }

    // Add unique results
    for (const result of response.results) {
      if (!seenUrls.has(result.url)) {
        seenUrls.add(result.url)
        allResults.push(result)
      }
    }
  }

  return {
    query: queries.join(' | '),
    results: allResults,
    total_results: allResults.length,
    error: allResults.length === 0 ? lastError : undefined,
  }
}
