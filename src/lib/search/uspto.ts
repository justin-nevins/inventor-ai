// USPTO PTAB API Client
// Searches IPR/PGR/CBM trials, decisions, and ex parte appeals
//
// IMPORTANT: Uses api.uspto.gov (not data.uspto.gov)
// - data.uspto.gov returns "Please use api.uspto.gov" error
// - api.uspto.gov requires GET with query params (not POST with JSON body)
//
// Documentation:
// - Getting Started: https://data.uspto.gov/apis/getting-started
// - Rate Limits: https://data.uspto.gov/apis/api-rate-limits
//
// Authentication:
// 1. Create USPTO.gov account + ID.me verification
// 2. Get API key from "My ODP" page
// 3. Set environment variable: USPTO_API_KEY
// 4. Header: X-API-Key
//
// API Parameters:
// - q: Lucene query string (e.g., "*:*" for all, "patentNumber:12345678")
// - offset: Starting position (default 0)
// - limit: Number of results (default 20)

export interface USPTOSearchParams {
  query: string
  start?: number
  rows?: number
  sort?: string
}

// API response structure from api.uspto.gov (nested format)
export interface USPTOProceeding {
  trialNumber: string
  lastModifiedDateTime?: string
  patentOwnerData?: {
    patentNumber: string
    grantDate?: string
    technologyCenterNumber?: string
    groupArtUnitNumber?: string
    applicationNumberText?: string
    inventorName?: string
  }
  trialMetaData?: {
    trialTypeCode: 'IPR' | 'PGR' | 'CBM'
    fileDownloadURI?: string
    trialStatusCategory?: string
    trialLastModifiedDate?: string
    petitionFilingDate?: string
    trialLastModifiedDateTime?: string
    institutionDecisionDate?: string
    finalDecisionDate?: string
  }
  regularPetitionerData?: {
    realPartyInInterestName?: string
    counselName?: string
  }
  // Legacy flat fields (keep for backward compatibility)
  patentNumber?: string
  patentTitle?: string
  filingDate?: string
  petitionerPartyName?: string
  patentOwnerPartyName?: string
  trialTypeCode?: 'IPR' | 'PGR' | 'CBM'
  prosecutionStatus?: string
  accordedFilingDate?: string
  institutionDecisionDate?: string
  finalDecisionDate?: string
}

export interface USPTODecision {
  documentIdentifier: string
  patentNumber: string
  patentTitle: string
  trialNumber: string
  decisionTypeCode: string
  decisionDate: string
  documentName: string
  decisionOutcome?: string
}

export interface USPTOAppealDecision {
  documentIdentifier: string
  patentNumber: string
  applicationNumber: string
  decisionDate: string
  documentTitle: string
  technologyCenter?: string
  outcome?: string
}

export interface USPTOSearchResult<T> {
  results: T[]
  recordTotalQuantity: number
  status: 'success' | 'error'
  error?: string
}

export interface PatentReference {
  patentNumber: string
  title: string
  filingDate: string
  status: string
  source: 'USPTO_PTAB' | 'USPTO_APPEALS' | 'USPTO_PATENTSVIEW'
  trialType?: string
  url: string
  relevanceContext?: string
  // PatentsView-specific fields
  abstract?: string
  assignee?: string
  isChallenged?: boolean // True if also found in PTAB
}

// IMPORTANT: Use api.uspto.gov (not data.uspto.gov which returns "use api.uspto.gov" error)
// Method: GET with query params (not POST with JSON body)
const USPTO_BASE_URL = 'https://api.uspto.gov'

const ENDPOINTS = {
  proceedings: '/api/v1/patent/trials/proceedings/search',
  decisions: '/api/v1/patent/trials/decisions/search',
  appeals: '/api/v1/patent/appeals/decisions/search',
} as const

/**
 * USPTO PTAB API Client
 * Handles authentication and rate limiting for USPTO PTAB API v3
 */
export class USPTOClient {
  private apiKey: string
  private lastRequestTime = 0
  private readonly minRequestInterval = 1000 // 1 second between requests (60/min limit)

  constructor(apiKey?: string) {
    const key = apiKey || process.env.USPTO_API_KEY
    if (!key) {
      throw new Error('USPTO_API_KEY is required. Set it in environment variables.')
    }
    this.apiKey = key
  }

  /**
   * Enforces rate limiting - waits if necessary to respect 60 req/min limit
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve =>
        setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
      )
    }
    this.lastRequestTime = Date.now()
  }

  /**
   * Makes authenticated request to USPTO API
   * IMPORTANT: Uses GET with query params (not POST with JSON body)
   * api.uspto.gov requires query string params, not JSON body
   */
  private async makeRequest<T>(
    endpoint: string,
    params: Record<string, unknown>
  ): Promise<USPTOSearchResult<T>> {
    await this.enforceRateLimit()

    try {
      // Build query string from params
      const queryParams = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value))
        }
      }

      const url = `${USPTO_BASE_URL}${endpoint}?${queryParams.toString()}`
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            'USPTO API authentication failed. API key requires ID.me verification. ' +
            'See: https://data.uspto.gov/apis/getting-started'
          )
        }
        if (response.status === 400) {
          const errorBody = await response.text()
          throw new Error(`USPTO API bad request: ${errorBody}`)
        }
        if (response.status === 429) {
          throw new Error('USPTO API rate limit exceeded. Please wait before retrying.')
        }
        throw new Error(`USPTO API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      // api.uspto.gov uses different field names:
      // - count (not recordTotalQuantity)
      // - patentTrialProceedingDataBag (for proceedings)
      // - patentTrialDecisionDataBag (for decisions)
      // - patentAppealDecisionDataBag (for appeals)
      const results = data.patentTrialProceedingDataBag ||
        data.patentTrialDecisionDataBag ||
        data.patentAppealDecisionDataBag ||
        data.results ||
        []

      return {
        results,
        recordTotalQuantity: data.count || data.recordTotalQuantity || 0,
        status: 'success',
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('USPTO API request failed:', errorMessage)

      return {
        results: [],
        recordTotalQuantity: 0,
        status: 'error',
        error: errorMessage,
      }
    }
  }

  /**
   * Search PTAB proceedings (IPR, PGR, CBM trials)
   * ODP v3 uses: q, offset, limit (not query, start, rows)
   */
  async searchProceedings(params: USPTOSearchParams): Promise<USPTOSearchResult<USPTOProceeding>> {
    return this.makeRequest<USPTOProceeding>(ENDPOINTS.proceedings, {
      q: params.query,
      offset: params.start || 0,
      limit: params.rows || 20,
      sort: params.sort || 'accordedFilingDate desc',
    })
  }

  /**
   * Search PTAB decisions
   * ODP v3 uses: q, offset, limit (not query, start, rows)
   */
  async searchDecisions(params: USPTOSearchParams): Promise<USPTOSearchResult<USPTODecision>> {
    return this.makeRequest<USPTODecision>(ENDPOINTS.decisions, {
      q: params.query,
      offset: params.start || 0,
      limit: params.rows || 20,
      sort: params.sort || 'decisionDate desc',
    })
  }

  /**
   * Search ex parte appeal decisions
   * ODP v3 uses: q, offset, limit (not query, start, rows)
   */
  async searchAppeals(params: USPTOSearchParams): Promise<USPTOSearchResult<USPTOAppealDecision>> {
    return this.makeRequest<USPTOAppealDecision>(ENDPOINTS.appeals, {
      q: params.query,
      offset: params.start || 0,
      limit: params.rows || 20,
      sort: params.sort || 'decisionDate desc',
    })
  }
}

/**
 * Escapes special Lucene characters to avoid 500 errors
 * Characters: + - && || ! ( ) { } [ ] ^ " ~ * ? : \ /
 */
function escapeLucene(term: string): string {
  // Remove or escape problematic characters
  return term
    .replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Builds a Lucene query string for USPTO PTAB searches
 *
 * SIMPLIFIED to avoid 500 errors:
 * - Limits to 5 keywords max
 * - Escapes special Lucene characters
 * - Uses simpler query structure
 */
export function buildUSPTOQuery(keywords: string[], options?: {
  patentNumberRange?: { from: number; to: number }
  trialType?: 'IPR' | 'PGR' | 'CBM'
  dateRange?: { field: string; from: string; to: string }
}): string {
  const parts: string[] = []

  // Add keyword search - SIMPLIFIED: limit to 5 keywords, escape special chars
  if (keywords.length > 0) {
    // Take first 5 keywords only
    const limitedKeywords = keywords.slice(0, 5)

    // Escape and clean each keyword
    const cleanKeywords = limitedKeywords
      .map(k => escapeLucene(k))
      .filter(k => k.length > 2) // Remove very short terms
      .slice(0, 5) // Re-limit after filtering

    if (cleanKeywords.length > 0) {
      // Simple query: just search in patentTitle with OR
      // Avoid nested parentheses and complex field combinations
      const keywordQuery = cleanKeywords.join(' OR ')
      parts.push(`patentTitle:(${keywordQuery})`)
    }
  }

  // Add patent number range if specified
  if (options?.patentNumberRange) {
    parts.push(`patentNumber:[${options.patentNumberRange.from} TO ${options.patentNumberRange.to}]`)
  }

  // Add trial type filter
  if (options?.trialType) {
    parts.push(`trialMetaData.trialTypeCode:${options.trialType}`)
  }

  // Add date range
  if (options?.dateRange) {
    parts.push(`${options.dateRange.field}:[${options.dateRange.from} TO ${options.dateRange.to}]`)
  }

  return parts.join(' AND ') || '*:*'
}

/**
 * Generates a clickable URL for a patent
 */
export function getPatentUrl(patentNumber: string): string {
  // Clean the patent number (remove dashes, spaces, etc.)
  const cleanNumber = patentNumber.replace(/[\s-]/g, '').toUpperCase()

  // Use Google Patents for better accessibility
  return `https://patents.google.com/patent/US${cleanNumber}`
}

/**
 * Generates a URL to USPTO PTAB portal for a specific trial
 */
export function getPTABTrialUrl(trialNumber: string): string {
  return `https://ptab.uspto.gov/#/trials/${trialNumber}`
}

/**
 * Converts USPTO API results to standardized PatentReference format
 * Handles nested structure from api.uspto.gov
 */
export function proceedingToPatentReference(proc: USPTOProceeding): PatentReference {
  // Handle nested structure from api.uspto.gov
  const patentNumber = proc.patentOwnerData?.patentNumber || proc.patentNumber || ''
  const trialType = proc.trialMetaData?.trialTypeCode || proc.trialTypeCode || 'IPR'
  const filingDate = proc.trialMetaData?.petitionFilingDate || proc.accordedFilingDate || proc.filingDate || ''
  const status = proc.trialMetaData?.trialStatusCategory || proc.prosecutionStatus || 'Unknown'
  const petitioner = proc.regularPetitionerData?.realPartyInInterestName || proc.petitionerPartyName || 'Unknown'
  const inventorName = proc.patentOwnerData?.inventorName || proc.patentOwnerPartyName || 'Unknown'

  return {
    patentNumber,
    title: inventorName, // API doesn't provide title, use inventor name as fallback
    filingDate,
    status,
    source: 'USPTO_PTAB',
    trialType,
    url: getPatentUrl(patentNumber),
    relevanceContext: `${trialType} proceeding (${proc.trialNumber}): ${petitioner} vs Patent Owner`,
  }
}

export function decisionToPatentReference(dec: USPTODecision): PatentReference {
  return {
    patentNumber: dec.patentNumber,
    title: dec.patentTitle || dec.documentName || 'Title not available',
    filingDate: dec.decisionDate,
    status: dec.decisionOutcome || dec.decisionTypeCode || 'Decision rendered',
    source: 'USPTO_PTAB',
    url: getPatentUrl(dec.patentNumber),
    relevanceContext: `PTAB Decision: ${dec.documentName}`,
  }
}

export function appealToPatentReference(appeal: USPTOAppealDecision): PatentReference {
  return {
    patentNumber: appeal.patentNumber || appeal.applicationNumber,
    title: appeal.documentTitle || 'Title not available',
    filingDate: appeal.decisionDate,
    status: appeal.outcome || 'Appeal decided',
    source: 'USPTO_APPEALS',
    url: appeal.patentNumber ? getPatentUrl(appeal.patentNumber) : `https://patents.google.com/patent/US${appeal.applicationNumber}`,
    relevanceContext: appeal.technologyCenter
      ? `Ex Parte Appeal - Technology Center: ${appeal.technologyCenter}`
      : 'Ex Parte Appeal Decision',
  }
}

/**
 * Performs a comprehensive USPTO search across all endpoints
 * Returns combined results from proceedings, decisions, and appeals
 */
export async function searchUSPTOComprehensive(
  keywords: string[],
  options?: {
    maxResultsPerEndpoint?: number
    includeProceedings?: boolean
    includeDecisions?: boolean
    includeAppeals?: boolean
  }
): Promise<{
  patents: PatentReference[]
  totalCount: number
  errors: string[]
}> {
  const apiKey = process.env.USPTO_API_KEY
  if (!apiKey) {
    return {
      patents: [],
      totalCount: 0,
      errors: ['USPTO_API_KEY not configured. Please add it to your environment variables.'],
    }
  }

  const client = new USPTOClient(apiKey)
  const query = buildUSPTOQuery(keywords)
  const maxResults = options?.maxResultsPerEndpoint || 10

  const includeProceedings = options?.includeProceedings !== false
  const includeDecisions = options?.includeDecisions !== false
  const includeAppeals = options?.includeAppeals !== false

  const patents: PatentReference[] = []
  const errors: string[] = []
  let totalCount = 0

  // Search proceedings
  if (includeProceedings) {
    const procResult = await client.searchProceedings({ query, rows: maxResults })
    if (procResult.status === 'error') {
      errors.push(`Proceedings search failed: ${procResult.error}`)
    } else {
      patents.push(...procResult.results.map(proceedingToPatentReference))
      totalCount += procResult.recordTotalQuantity
    }
  }

  // Search decisions
  if (includeDecisions) {
    const decResult = await client.searchDecisions({ query, rows: maxResults })
    if (decResult.status === 'error') {
      errors.push(`Decisions search failed: ${decResult.error}`)
    } else {
      patents.push(...decResult.results.map(decisionToPatentReference))
      totalCount += decResult.recordTotalQuantity
    }
  }

  // Search appeals
  if (includeAppeals) {
    const appealResult = await client.searchAppeals({ query, rows: maxResults })
    if (appealResult.status === 'error') {
      errors.push(`Appeals search failed: ${appealResult.error}`)
    } else {
      patents.push(...appealResult.results.map(appealToPatentReference))
      totalCount += appealResult.recordTotalQuantity
    }
  }

  // Deduplicate by patent number
  const seen = new Set<string>()
  const uniquePatents = patents.filter(p => {
    if (seen.has(p.patentNumber)) return false
    seen.add(p.patentNumber)
    return true
  })

  return {
    patents: uniquePatents,
    totalCount,
    errors,
  }
}

/**
 * Extracts relevant keywords from an invention description for patent search
 */
export function extractPatentKeywords(
  inventionName: string,
  description: string,
  keyFeatures?: string[]
): string[] {
  // Combine all text sources
  const allText = [
    inventionName,
    description,
    ...(keyFeatures || []),
  ].join(' ')

  // Common words to exclude from patent searches
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
    'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'can', 'will', 'just', 'should', 'now', 'that', 'this', 'which', 'what',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'having', 'do', 'does', 'did', 'doing', 'would', 'could', 'might', 'must',
    'shall', 'it', 'its', 'they', 'them', 'their', 'we', 'us', 'our', 'you',
    'your', 'i', 'my', 'me', 'he', 'she', 'him', 'her', 'his', 'hers',
    'invention', 'device', 'method', 'system', 'apparatus', 'product', 'solution',
    'user', 'users', 'using', 'use', 'used', 'provide', 'provides', 'provided',
    'include', 'includes', 'included', 'including', 'also', 'new', 'novel',
  ])

  // Extract words and filter
  const words = allText
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(word =>
      word.length > 2 &&
      !stopWords.has(word) &&
      !/^\d+$/.test(word)
    )

  // Count word frequency
  const wordCount = new Map<string, number>()
  words.forEach(word => {
    wordCount.set(word, (wordCount.get(word) || 0) + 1)
  })

  // Sort by frequency and take top keywords
  const sortedWords = [...wordCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 10)

  // Also extract multi-word phrases (bigrams) that appear in the invention name
  const namePhrases = inventionName
    .toLowerCase()
    .split(/[,;]/)
    .map(phrase => phrase.trim())
    .filter(phrase => phrase.length > 3 && phrase.split(' ').length <= 4)

  return [...new Set([...namePhrases, ...sortedWords])]
}

/**
 * AI-generated patent search query structure
 * Based on InventorAI Search Strategy: function-based queries with synonym expansion
 */
export interface PatentQuerySet {
  // Core function queries (what it does)
  functionQueries: string[]
  // Problem/solution queries
  problemQueries: string[]
  // Mechanism/material queries
  mechanismQueries: string[]
  // Synonym-expanded variants
  synonymQueries: string[]
  // All queries combined for execution
  allQueries: string[]
}

/**
 * AI-powered patent query generation
 * Decomposes invention into function-based queries with synonym expansion
 *
 * Strategy from notes:
 * - Convert invention into "functions + constraints" (what it does, for whom, under what conditions)
 * - Use synonym expansion ("hydration" → "fluid delivery", "refillable reservoir")
 * - Generate variants: noun+verb, problem phrasing, mechanism/material
 */
export async function generatePatentSearchQueries(
  inventionName: string,
  description: string,
  problemStatement?: string,
  keyFeatures?: string[]
): Promise<PatentQuerySet> {
  // Import here to avoid circular dependency
  const { createCompletion } = await import('../ai/ai-client')

  const prompt = `You are a patent search specialist. Analyze this invention and generate optimized patent search queries.

## Invention
Name: ${inventionName}
Description: ${description}
${problemStatement ? `Problem it solves: ${problemStatement}` : ''}
${keyFeatures?.length ? `Key features: ${keyFeatures.join(', ')}` : ''}

## Your Task
Generate search queries optimized for patent databases (USPTO, Google Patents).

CRITICAL: Think in terms of FUNCTIONS and MECHANISMS, not product names.
- "portable bidet" → "personal hygiene fluid dispenser", "handheld cleaning apparatus"
- "smart pet feeder" → "automated animal feeding device", "programmable food dispensing system"

## Output Format
Return a JSON object with these arrays (2-3 queries each, max 10 total):

{
  "functionQueries": [
    "queries describing what it DOES (verb + object)",
    "e.g., 'fluid dispensing apparatus', 'automated feeding mechanism'"
  ],
  "problemQueries": [
    "queries framing the PROBLEM it solves",
    "e.g., 'portable hygiene solution', 'pet feeding automation'"
  ],
  "mechanismQueries": [
    "queries about HOW it works (materials, components)",
    "e.g., 'silicone reservoir valve assembly', 'motorized portion control'"
  ],
  "synonymQueries": [
    "alternative technical terms for same concepts",
    "e.g., 'handheld irrigation device', 'animal nutrition dispenser'"
  ]
}

Keep queries 2-5 words. Use patent-style terminology (apparatus, device, system, method, assembly).
Return ONLY the JSON object, no explanation.`

  try {
    const response = await createCompletion(prompt, undefined, {
      model: 'claude-3-haiku-20240307',
      maxTokens: 1024,
      temperature: 0.3, // Slight creativity for synonyms
    })

    let jsonText = response.text.trim()
    const jsonMatch = jsonText.match(/```json\n([\s\S]*?)\n```/) ||
                      jsonText.match(/```\n([\s\S]*?)\n```/) ||
                      jsonText.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      jsonText = jsonMatch[1] || jsonMatch[0]
    }

    const parsed = JSON.parse(jsonText) as Omit<PatentQuerySet, 'allQueries'>

    // Combine all queries and deduplicate
    const allQueries = [
      ...(parsed.functionQueries || []),
      ...(parsed.problemQueries || []),
      ...(parsed.mechanismQueries || []),
      ...(parsed.synonymQueries || []),
    ].filter((q, i, arr) => q && arr.indexOf(q) === i)

    console.log(`[USPTO] AI generated ${allQueries.length} patent search queries`)

    return {
      ...parsed,
      allQueries: allQueries.slice(0, 10), // Cap at 10 queries
    }
  } catch (error) {
    console.error('[USPTO] AI query generation failed, using fallback:', error)

    // Fallback to basic keyword extraction
    const keywords = extractPatentKeywords(inventionName, description, keyFeatures)
    const fallbackQueries = keywords.slice(0, 6)

    return {
      functionQueries: fallbackQueries.slice(0, 2),
      problemQueries: [],
      mechanismQueries: [],
      synonymQueries: [],
      allQueries: fallbackQueries,
    }
  }
}

/**
 * Execute multiple patent searches with different queries
 * Aggregates and deduplicates results
 */
export async function searchUSPTOWithMultipleQueries(
  queries: string[],
  options?: {
    maxResultsPerQuery?: number
    includeProceedings?: boolean
    includeDecisions?: boolean
    includeAppeals?: boolean
  }
): Promise<{
  patents: PatentReference[]
  totalCount: number
  errors: string[]
  queriesUsed: string[]
}> {
  const apiKey = process.env.USPTO_API_KEY
  if (!apiKey) {
    return {
      patents: [],
      totalCount: 0,
      errors: ['USPTO_API_KEY not configured'],
      queriesUsed: queries,
    }
  }

  const client = new USPTOClient(apiKey)
  const maxResults = options?.maxResultsPerQuery || 5
  const includeProceedings = options?.includeProceedings !== false
  const includeDecisions = options?.includeDecisions !== false
  const includeAppeals = options?.includeAppeals !== false

  const allPatents: PatentReference[] = []
  const errors: string[] = []
  let totalCount = 0

  // Execute searches for each query
  for (const queryText of queries.slice(0, 6)) { // Limit to 6 queries to control API usage
    const luceneQuery = buildUSPTOQuery([queryText])

    console.log(`[USPTO] Searching: "${queryText}"`)

    // Search proceedings
    if (includeProceedings) {
      const procResult = await client.searchProceedings({ query: luceneQuery, rows: maxResults })
      if (procResult.status === 'error') {
        errors.push(`Proceedings (${queryText}): ${procResult.error}`)
      } else {
        allPatents.push(...procResult.results.map(proceedingToPatentReference))
        totalCount += procResult.recordTotalQuantity
      }
    }

    // Search decisions (only for first 3 queries to save API calls)
    if (includeDecisions && queries.indexOf(queryText) < 3) {
      const decResult = await client.searchDecisions({ query: luceneQuery, rows: maxResults })
      if (decResult.status === 'error') {
        errors.push(`Decisions (${queryText}): ${decResult.error}`)
      } else {
        allPatents.push(...decResult.results.map(decisionToPatentReference))
        totalCount += decResult.recordTotalQuantity
      }
    }

    // Search appeals (only for first 2 queries)
    if (includeAppeals && queries.indexOf(queryText) < 2) {
      const appealResult = await client.searchAppeals({ query: luceneQuery, rows: maxResults })
      if (appealResult.status === 'error') {
        errors.push(`Appeals (${queryText}): ${appealResult.error}`)
      } else {
        allPatents.push(...appealResult.results.map(appealToPatentReference))
        totalCount += appealResult.recordTotalQuantity
      }
    }
  }

  // Deduplicate by patent number
  const seen = new Set<string>()
  const uniquePatents = allPatents.filter(p => {
    if (!p.patentNumber || seen.has(p.patentNumber)) return false
    seen.add(p.patentNumber)
    return true
  })

  console.log(`[USPTO] Found ${uniquePatents.length} unique patents from ${queries.length} queries`)

  return {
    patents: uniquePatents,
    totalCount,
    errors,
    queriesUsed: queries,
  }
}

// =============================================================================
// PatentsView API Client
// Searches ALL granted US patents (12M+), not just challenged patents
// =============================================================================

const PATENTSVIEW_BASE_URL = 'https://search.patentsview.org/api/v1/patent/'

/**
 * PatentsView API response structure
 */
export interface PatentsViewPatent {
  patent_id: string
  patent_title: string
  patent_abstract: string
  patent_date: string
  patent_type?: string
  patent_kind?: string
  // Nested assignee data
  assignees?: Array<{
    assignee_organization?: string
    assignee_individual_name_first?: string
    assignee_individual_name_last?: string
  }>
}

export interface PatentsViewSearchResult {
  patents: PatentsViewPatent[]
  total_patent_count: number
  count: number
}

/**
 * PatentsView PatentSearch API Client
 * Searches ALL US patents (not just challenged ones)
 *
 * Authentication: X-Api-Key header
 * Rate limit: 45 requests/minute
 * Docs: https://search.patentsview.org/docs/
 */
export class PatentsViewClient {
  private apiKey: string
  private lastRequestTime = 0
  private readonly minRequestInterval = 1334 // 45 req/min = ~1334ms between requests

  constructor(apiKey?: string) {
    const key = apiKey || process.env.PATENTSVIEW_API_KEY
    if (!key) {
      throw new Error('PATENTSVIEW_API_KEY required. Request at https://patentsview.org/apis/keyrequest')
    }
    this.apiKey = key
  }

  /**
   * Enforces rate limiting for 45 req/min
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve =>
        setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
      )
    }
    this.lastRequestTime = Date.now()
  }

  /**
   * Search patents using PatentsView API
   * Uses _text_any operator for full-text search across title and abstract
   */
  async searchPatents(params: {
    searchTerms: string[]
    limit?: number
  }): Promise<{ patents: PatentsViewPatent[], totalCount: number, error?: string }> {
    await this.enforceRateLimit()

    try {
      // Build query using _text_any for text search
      // Searches both title and abstract
      const searchText = params.searchTerms.join(' ')
      const query = {
        _or: [
          { _text_any: { patent_title: searchText } },
          { _text_any: { patent_abstract: searchText } },
        ]
      }

      const response = await fetch(PATENTSVIEW_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify({
          q: query,
          f: ['patent_id', 'patent_title', 'patent_abstract', 'patent_date', 'patent_type', 'patent_kind', 'assignees'],
          o: { size: params.limit || 25 },
          s: [{ patent_date: 'desc' }], // Most recent first
        }),
      })

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('PatentsView API authentication failed. Check PATENTSVIEW_API_KEY.')
        }
        if (response.status === 429) {
          throw new Error('PatentsView API rate limit exceeded (45/min). Please wait.')
        }
        const errorBody = await response.text()
        throw new Error(`PatentsView API error ${response.status}: ${errorBody}`)
      }

      const data = await response.json() as PatentsViewSearchResult

      return {
        patents: data.patents || [],
        totalCount: data.total_patent_count || 0,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[PatentsView] API request failed:', errorMessage)

      return {
        patents: [],
        totalCount: 0,
        error: errorMessage,
      }
    }
  }
}

/**
 * Converts PatentsView patent to standardized PatentReference format
 */
export function patentsViewToPatentReference(patent: PatentsViewPatent): PatentReference {
  const assignee = patent.assignees?.[0]
  const assigneeName = assignee?.assignee_organization ||
    (assignee?.assignee_individual_name_first
      ? `${assignee.assignee_individual_name_first} ${assignee.assignee_individual_name_last || ''}`
      : undefined)

  return {
    patentNumber: patent.patent_id,
    title: patent.patent_title || 'Title not available',
    filingDate: patent.patent_date || '',
    status: patent.patent_type || 'Granted',
    source: 'USPTO_PATENTSVIEW',
    url: getPatentUrl(patent.patent_id),
    abstract: patent.patent_abstract,
    assignee: assigneeName,
    relevanceContext: assigneeName
      ? `Granted patent - Assignee: ${assigneeName}`
      : 'Granted patent from USPTO',
  }
}

/**
 * Search PatentsView with multiple queries
 * Returns aggregated, deduplicated results
 */
export async function searchPatentsViewWithQueries(
  queries: string[],
  options?: {
    maxResultsPerQuery?: number
  }
): Promise<{
  patents: PatentReference[]
  totalCount: number
  errors: string[]
  queriesUsed: string[]
}> {
  const apiKey = process.env.PATENTSVIEW_API_KEY
  if (!apiKey) {
    return {
      patents: [],
      totalCount: 0,
      errors: ['PATENTSVIEW_API_KEY not configured. Request at https://patentsview.org/apis/keyrequest'],
      queriesUsed: queries,
    }
  }

  const client = new PatentsViewClient(apiKey)
  const maxResults = options?.maxResultsPerQuery || 10
  const allPatents: PatentReference[] = []
  const errors: string[] = []
  let totalCount = 0

  // Execute searches for each query (limit to 5 to respect rate limits)
  for (const queryText of queries.slice(0, 5)) {
    console.log(`[PatentsView] Searching: "${queryText}"`)

    const result = await client.searchPatents({
      searchTerms: queryText.split(' '),
      limit: maxResults,
    })

    if (result.error) {
      errors.push(`PatentsView (${queryText}): ${result.error}`)
    } else {
      allPatents.push(...result.patents.map(patentsViewToPatentReference))
      totalCount += result.totalCount
    }
  }

  // Deduplicate by patent number
  const seen = new Set<string>()
  const uniquePatents = allPatents.filter(p => {
    if (!p.patentNumber || seen.has(p.patentNumber)) return false
    seen.add(p.patentNumber)
    return true
  })

  console.log(`[PatentsView] Found ${uniquePatents.length} unique patents from ${queries.length} queries`)

  return {
    patents: uniquePatents,
    totalCount,
    errors,
    queriesUsed: queries,
  }
}

/**
 * Merges results from PatentsView and PTAB
 * Marks patents as "challenged" if they appear in PTAB
 */
export function mergePatentResults(
  patentsViewResults: PatentReference[],
  ptabResults: PatentReference[]
): PatentReference[] {
  // Create a set of patent numbers that have been challenged (appear in PTAB)
  const challengedPatents = new Set(
    ptabResults.map(p => p.patentNumber.replace(/[\s-]/g, '').toUpperCase())
  )

  // Mark PatentsView results as challenged if they appear in PTAB
  const mergedPatentsView = patentsViewResults.map(p => ({
    ...p,
    isChallenged: challengedPatents.has(p.patentNumber.replace(/[\s-]/g, '').toUpperCase()),
  }))

  // Deduplicate - prefer PatentsView data (has abstract) but mark as challenged
  const seen = new Set<string>()
  const merged: PatentReference[] = []

  // Add PatentsView results first (they have abstracts)
  for (const patent of mergedPatentsView) {
    const normalized = patent.patentNumber.replace(/[\s-]/g, '').toUpperCase()
    if (!seen.has(normalized)) {
      seen.add(normalized)
      merged.push(patent)
    }
  }

  // Add PTAB results that weren't in PatentsView
  for (const patent of ptabResults) {
    const normalized = patent.patentNumber.replace(/[\s-]/g, '').toUpperCase()
    if (!seen.has(normalized)) {
      seen.add(normalized)
      merged.push({
        ...patent,
        isChallenged: true, // All PTAB results are challenged by definition
      })
    }
  }

  return merged
}
