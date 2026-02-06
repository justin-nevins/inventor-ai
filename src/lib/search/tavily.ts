// Tavily Search API Client
// Provides real web search results for novelty checking
// Best practices: https://docs.tavily.com/documentation/best-practices/best-practices-search

export interface TavilySearchResult {
  title: string
  description: string
  url: string
  score: number // Relevance score 0-1
  age?: string
  language?: string
  family_friendly?: boolean
}

export interface TavilySearchResponse {
  query: string
  results: TavilySearchResult[]
  total_results?: number
  error?: string
}

interface TavilyAPIResult {
  title: string
  url: string
  content: string
  score: number
  published_date?: string
}

interface TavilyAPIResponse {
  query: string
  results: TavilyAPIResult[]
  answer?: string
}

const TAVILY_API_URL = 'https://api.tavily.com/search'

// Retail and crowdfunding domains for product discovery
const PRODUCT_DISCOVERY_DOMAINS = [
  'amazon.com',
  'ebay.com',
  'walmart.com',
  'target.com',
  'etsy.com',
  'aliexpress.com',
  'kickstarter.com',
  'indiegogo.com',
  'producthunt.com',
  'bestbuy.com',
]

// Minimum relevance score threshold (0.6 recommended by Tavily)
const MIN_RELEVANCE_SCORE = 0.5

/**
 * Search the web using Tavily Search API
 * @param query - Search query string (keep under 400 chars)
 * @param options - Search options
 * @returns Search results with title, description, URL, and relevance score
 */
export async function tavilySearch(
  query: string,
  options: {
    maxResults?: number
    searchDepth?: 'basic' | 'advanced'
    includeDomains?: string[]
    excludeDomains?: string[]
    includeRawContent?: boolean
  } = {}
): Promise<TavilySearchResponse> {
  const {
    maxResults = 10,
    searchDepth = 'basic',
    includeDomains,
    excludeDomains,
    includeRawContent = false,
  } = options

  const apiKey = process.env.TAVILY_API_KEY

  // Debug: Log key presence (not the actual key!)
  const keyInfo = apiKey
    ? `Key present (${apiKey.length} chars)`
    : 'Key NOT SET'
  console.log(`[Tavily API] ${keyInfo}, depth: ${searchDepth}, query: "${query.substring(0, 50)}..."`)

  if (!apiKey) {
    console.error('[Tavily API] TAVILY_API_KEY environment variable is not set')
    return {
      query,
      results: [],
      error: 'TAVILY_API_KEY environment variable is not set',
    }
  }

  try {
    // Cap max_results at 10 for quality (Tavily recommendation)
    const effectiveMaxResults = Math.min(maxResults, 10)

    const requestBody: Record<string, unknown> = {
      api_key: apiKey,
      query: query.substring(0, 400), // Keep under 400 chars
      max_results: effectiveMaxResults,
      search_depth: searchDepth,
      include_answer: false,
      include_raw_content: includeRawContent,
    }

    // Add domain filtering if specified
    if (includeDomains && includeDomains.length > 0) {
      requestBody.include_domains = includeDomains.slice(0, 300) // Max 300 domains
    }
    if (excludeDomains && excludeDomains.length > 0) {
      requestBody.exclude_domains = excludeDomains.slice(0, 150) // Max 150 domains
    }

    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    console.log(`[Tavily API] Response status: ${response.status}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Tavily API] Error: ${errorText}`)

      if (response.status === 401) {
        return {
          query,
          results: [],
          error: `Invalid Tavily API key (401). Response: ${errorText.substring(0, 200)}`,
        }
      }

      if (response.status === 429) {
        return {
          query,
          results: [],
          error: `Tavily API rate limit exceeded (429). Response: ${errorText.substring(0, 200)}`,
        }
      }

      return {
        query,
        results: [],
        error: `Tavily API error (${response.status}): ${errorText.substring(0, 200)}`,
      }
    }

    const data: TavilyAPIResponse = await response.json()

    // Convert and filter by relevance score
    const results: TavilySearchResult[] = data.results
      .filter((result) => result.score >= MIN_RELEVANCE_SCORE)
      .map((result) => ({
        title: result.title,
        description: result.content || '',
        url: result.url,
        score: result.score,
        age: result.published_date,
      }))

    console.log(`[Tavily API] Got ${data.results.length} results, ${results.length} above score threshold`)

    return {
      query: data.query || query,
      results,
      total_results: results.length,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Tavily Search API error:', errorMessage)

    return {
      query,
      results: [],
      error: `Failed to fetch search results: ${errorMessage}`,
    }
  }
}

/**
 * Decompose an invention into focused search queries
 * Best practice: 3-5 feature-focused queries instead of one complex query
 *
 * @example
 * Input: "Smart Pet Feeder with Camera"
 * Output: [
 *   "automatic pet feeder camera",
 *   "smart pet feeder smartphone app",
 *   "wifi pet food dispenser"
 * ]
 */
export function generateNoveltySearchQueries(
  inventionName: string,
  description: string,
  problemStatement?: string,
  keyFeatures?: string[]
): string[] {
  const queries: string[] = []

  // Extract core product type from name
  const coreTerms = extractKeywords(inventionName)

  // Query 1: Core product search
  if (coreTerms) {
    queries.push(coreTerms)
  }

  // Query 2: Problem-solution search
  if (problemStatement) {
    const problemKeywords = extractKeywords(problemStatement)
    if (problemKeywords) {
      queries.push(`${problemKeywords} solution`)
    }
  }

  // Query 3-5: Feature-based searches (most important for novelty)
  if (keyFeatures && keyFeatures.length > 0) {
    // Each key feature becomes its own focused query
    for (const feature of keyFeatures.slice(0, 3)) {
      const featureKeywords = extractKeywords(feature)
      if (featureKeywords && featureKeywords.length > 3) {
        queries.push(featureKeywords)
      }
    }
  }

  // Query: Description-based (fallback if not enough queries)
  if (queries.length < 3) {
    const descKeywords = extractKeywords(description)
    if (descKeywords) {
      queries.push(`${descKeywords} product`)
    }
  }

  // Deduplicate and limit to 5 queries
  const uniqueQueries = [...new Set(queries)]
  return uniqueQueries.slice(0, 5)
}

/**
 * Extract key terms from text, removing stop words
 * Returns concise keyword string for search queries
 */
function extractKeywords(text: string): string {
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
    'then', 'once', 'here', 'there', 'any', 'our', 'your', 'their', 'its',
    'my', 'his', 'her', 'device', 'system', 'apparatus', 'method',
    'invention', 'product', 'innovative', 'new', 'novel', 'smart',
    'intelligent', 'advanced', 'automatic', 'automated', 'using', 'uses',
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
 * Run comprehensive novelty search with multiple queries
 * Phase 1: Broad discovery on retail/crowdfunding sites
 * Phase 2: General web search for additional matches
 */
export async function runMultipleSearches(
  queries: string[],
  resultsPerQuery: number = 10
): Promise<TavilySearchResponse> {
  const allResults: TavilySearchResult[] = []
  const seenUrls = new Set<string>()
  let lastError: string | undefined

  // Phase 1: Search retail/crowdfunding domains first (most relevant for products)
  console.log(`[Tavily] Phase 1: Searching ${PRODUCT_DISCOVERY_DOMAINS.length} retail domains`)
  for (const query of queries.slice(0, 2)) {
    const response = await tavilySearch(query, {
      maxResults: resultsPerQuery,
      searchDepth: 'basic',
      includeDomains: PRODUCT_DISCOVERY_DOMAINS,
    })

    if (response.error && response.results.length === 0) {
      lastError = response.error
      if (response.error.includes('API key') || response.error.includes('rate limit')) {
        return response
      }
      continue
    }

    for (const result of response.results) {
      if (!seenUrls.has(result.url)) {
        seenUrls.add(result.url)
        allResults.push(result)
      }
    }
  }

  // Phase 2: Broader web search (no domain restriction)
  console.log(`[Tavily] Phase 2: General web search`)
  for (const query of queries) {
    const response = await tavilySearch(query, {
      maxResults: resultsPerQuery,
      searchDepth: 'basic',
    })

    if (response.error && response.results.length === 0) {
      lastError = response.error
      if (response.error.includes('API key') || response.error.includes('rate limit')) {
        break
      }
      continue
    }

    for (const result of response.results) {
      if (!seenUrls.has(result.url)) {
        seenUrls.add(result.url)
        allResults.push(result)
      }
    }
  }

  // Sort by relevance score (highest first)
  allResults.sort((a, b) => b.score - a.score)

  return {
    query: queries.join(' | '),
    results: allResults,
    total_results: allResults.length,
    error: allResults.length === 0 ? lastError : undefined,
  }
}

/**
 * Tips for inventors on how to describe their invention for best search results
 */
export const INVENTOR_SEARCH_TIPS = {
  title: 'Tips for Better Novelty Search Results',
  tips: [
    {
      do: 'Be specific about the core function',
      example: '"automatic pet feeder with portion control"',
      dont: '"smart device for pets"',
    },
    {
      do: 'List distinct features separately',
      example: '["camera monitoring", "smartphone app", "scheduled feeding"]',
      dont: '"has many smart features"',
    },
    {
      do: 'Describe the problem clearly',
      example: '"Pet owners forget to feed pets on time when traveling"',
      dont: '"Makes life easier"',
    },
    {
      do: 'Use industry terms if known',
      example: '"IoT-enabled", "voice-activated", "solar-powered"',
      dont: '"Uses technology"',
    },
    {
      do: 'Mention target user or use case',
      example: '"for frequent travelers with cats"',
      dont: '"for anyone"',
    },
  ],
  queryDecomposition: {
    description: 'Your invention will be searched as multiple focused queries:',
    example: {
      invention: 'Smart Pet Feeder with Camera and Voice Control',
      queries: [
        'automatic pet feeder camera',
        'pet feeder voice control',
        'wifi pet food dispenser app',
        'scheduled pet feeding monitor',
      ],
    },
  },
}
