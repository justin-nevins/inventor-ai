// Retail Search Agent - Uses real eBay API data for novelty checking
// Phase 1: Fetch real products from eBay Browse API (or Brave Search fallback)
// Phase 2: Pass real data to Claude for novelty analysis

import Anthropic from '@anthropic-ai/sdk'
import type { NoveltyResult, NoveltyCheckRequest, NoveltyFinding, GraduatedTruthScores } from './types'
import {
  searchSimilarProducts,
  isEbayConfigured,
  type EbayProduct,
} from '../search/ebay'
import {
  runMultipleSearches,
  type BraveSearchResult,
} from '../search/brave'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

/**
 * Convert eBay product to NoveltyFinding format
 */
function ebayProductToFinding(product: EbayProduct): NoveltyFinding {
  return {
    title: product.title,
    description: `${product.condition || 'New'} - ${product.title}`,
    url: product.itemWebUrl,
    similarity_score: 0, // Will be set by Claude analysis
    source: 'eBay',
    metadata: {
      item_id: product.itemId,
      price: product.price
        ? `${product.price.currency} ${product.price.value}`
        : 'Price not available',
      condition: product.condition,
      image_url: product.image?.imageUrl,
      seller_username: product.seller?.username,
      seller_feedback: product.seller?.feedbackPercentage
        ? `${product.seller.feedbackPercentage}%`
        : undefined,
      categories: product.categories?.map((c) => c.categoryName).join(', '),
      location: product.itemLocation
        ? `${product.itemLocation.city || ''}, ${product.itemLocation.stateOrProvince || ''}, ${product.itemLocation.country || ''}`
            .replace(/^, /, '')
            .replace(/, $/, '')
        : undefined,
    },
  }
}

const ANALYSIS_PROMPT = {
  role: `You are a retail market analyst specializing in product discovery. You analyze real eBay product listings to determine if similar products already exist commercially.`,

  task: `Given an invention description and actual eBay search results, analyze how novel the invention is compared to what's already available for purchase.`,

  howTo: `
1. Review the invention details (name, description, problem it solves, key features)
2. Analyze each eBay product listing to determine similarity to the invention
3. For each product, assess:
   - Feature overlap (how many key features are shared)
   - Problem-solving approach (does it solve the same problem?)
   - Target use case (is it for the same audience/purpose?)
4. Assign similarity scores (0-1) to each product:
   - 0.8-1.0: Essentially the same product, near-identical
   - 0.6-0.8: Very similar, solves same problem similarly
   - 0.4-0.6: Moderately similar, some overlap
   - 0.2-0.4: Somewhat related, different approach
   - 0.0-0.2: Barely related, only superficial similarity
5. Determine overall novelty based on highest similarity found
6. Consider market positioning and differentiation opportunities
`,

  output: `Return ONLY valid JSON (no markdown, no explanation) with this structure:
{
  "is_novel": boolean,
  "confidence": number,
  "product_analyses": [
    {
      "item_id": "string (from input)",
      "similarity_score": number,
      "analysis": "1-2 sentence explanation"
    }
  ],
  "summary": "2-3 sentences on retail availability and competition",
  "truth_scores": {
    "objective_truth": number,
    "practical_truth": number,
    "completeness": number,
    "contextual_scope": number
  }
}`,
}

/**
 * Generate product-focused search queries for Brave
 * Targets major retail sites and shopping results
 */
function generateProductSearchQueries(
  inventionName: string,
  _description: string,
  keyFeatures?: string[]
): string[] {
  const queries: string[] = []

  // Direct product searches on major retailers
  queries.push(`"${inventionName}" site:amazon.com`)
  queries.push(`buy "${inventionName}" product`)
  queries.push(`"${inventionName}" shop price`)

  // Feature-based product search
  if (keyFeatures && keyFeatures.length > 0) {
    const topFeatures = keyFeatures.slice(0, 2).join(' ')
    queries.push(`buy ${topFeatures} product`)
  }

  // Generic shopping search
  queries.push(`${inventionName} for sale`)

  return queries.slice(0, 2) // Limit to 2 queries to preserve rate limits
}

/**
 * Convert Brave search result to NoveltyFinding format for retail context
 */
function braveResultToRetailFinding(result: BraveSearchResult): NoveltyFinding {
  // Try to identify the retailer from the URL
  const url = new URL(result.url)
  const retailer = identifyRetailer(url.hostname)

  return {
    title: result.title,
    description: result.description,
    url: result.url,
    similarity_score: 0, // Will be set by Claude analysis
    source: retailer || 'Web Search',
    metadata: {
      retailer,
      age: result.age,
    },
  }
}

/**
 * Identify retailer from hostname
 */
function identifyRetailer(hostname: string): string | undefined {
  const retailers: Record<string, string> = {
    'amazon.com': 'Amazon',
    'www.amazon.com': 'Amazon',
    'ebay.com': 'eBay',
    'www.ebay.com': 'eBay',
    'walmart.com': 'Walmart',
    'www.walmart.com': 'Walmart',
    'target.com': 'Target',
    'www.target.com': 'Target',
    'etsy.com': 'Etsy',
    'www.etsy.com': 'Etsy',
    'aliexpress.com': 'AliExpress',
    'www.aliexpress.com': 'AliExpress',
    'bestbuy.com': 'Best Buy',
    'www.bestbuy.com': 'Best Buy',
    'homedepot.com': 'Home Depot',
    'www.homedepot.com': 'Home Depot',
    'lowes.com': "Lowe's",
    'www.lowes.com': "Lowe's",
  }
  return retailers[hostname]
}

/**
 * Run retail search using Brave as fallback when eBay isn't configured
 */
async function runBraveRetailSearch(
  request: NoveltyCheckRequest
): Promise<NoveltyResult> {
  // Generate product-focused queries
  const searchQueries = generateProductSearchQueries(
    request.invention_name,
    request.description,
    request.key_features
  )

  // Run searches
  const searchResponse = await runMultipleSearches(searchQueries, 5)

  // Handle API errors
  if (searchResponse.error && searchResponse.results.length === 0) {
    return {
      agent_type: 'retail_search',
      is_novel: false,
      confidence: 0,
      findings: [],
      summary: `Retail search failed: ${searchResponse.error}`,
      truth_scores: {
        objective_truth: 0,
        practical_truth: 0,
        completeness: 0,
        contextual_scope: 0,
      },
      search_query_used: searchQueries[0],
      timestamp: new Date(),
    }
  }

  // No results = potentially novel
  if (searchResponse.results.length === 0) {
    return {
      agent_type: 'retail_search',
      is_novel: true,
      confidence: 0.6,
      findings: [],
      summary: 'No similar products found in retail search. This suggests the invention may be novel in the marketplace.',
      truth_scores: {
        objective_truth: 0.7,
        practical_truth: 0.6,
        completeness: 0.4,
        contextual_scope: 0.6,
      },
      search_query_used: searchQueries.join(' | '),
      timestamp: new Date(),
    }
  }

  // Convert to findings
  const findings = searchResponse.results.map(braveResultToRetailFinding)

  // Analyze with Claude
  const analysisResult = await analyzeRetailResults(
    request,
    searchResponse.results,
    searchQueries
  )

  // Update findings with similarity scores
  const updatedFindings = findings.map((finding, index) => {
    const analysis = analysisResult.product_analyses?.find(
      (a: { result_index: number }) => a.result_index === index
    )
    if (analysis) {
      return {
        ...finding,
        similarity_score: analysis.similarity_score,
        description: analysis.analysis || finding.description,
      }
    }
    return finding
  })

  // Sort by similarity
  updatedFindings.sort((a, b) => b.similarity_score - a.similarity_score)

  return {
    agent_type: 'retail_search',
    is_novel: analysisResult.is_novel,
    confidence: analysisResult.confidence,
    findings: updatedFindings.slice(0, 10),
    summary: analysisResult.summary,
    truth_scores: analysisResult.truth_scores,
    search_query_used: searchQueries.join(' | '),
    timestamp: new Date(),
  }
}

/**
 * Analyze Brave retail search results with Claude
 */
async function analyzeRetailResults(
  request: NoveltyCheckRequest,
  results: BraveSearchResult[],
  queriesUsed: string[]
): Promise<{
  is_novel: boolean
  confidence: number
  product_analyses: Array<{ result_index: number; similarity_score: number; analysis: string }>
  summary: string
  truth_scores: GraduatedTruthScores
}> {
  const formattedResults = results
    .map(
      (result, index) =>
        `[Result ${index}]
Title: ${result.title}
URL: ${result.url}
Description: ${result.description}
${result.age ? `Age: ${result.age}` : ''}`
    )
    .join('\n\n')

  const prompt = `You are a retail market analyst. Analyze these REAL web search results to determine if similar products to the invention already exist for sale.

## Invention to Check:
- **Name**: ${request.invention_name}
- **Description**: ${request.description}
- **Problem Statement**: ${request.problem_statement || 'Not provided'}
- **Key Features**: ${request.key_features?.join(', ') || 'Not provided'}

## Search Queries Used:
${queriesUsed.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

## REAL Search Results (${results.length} total):
${formattedResults}

Analyze each result and return ONLY valid JSON:
{
  "is_novel": boolean (true if no close product matches found),
  "confidence": number (0-1),
  "product_analyses": [
    {
      "result_index": number,
      "similarity_score": number (0-1, how similar the product is),
      "analysis": "1-2 sentence explanation"
    }
  ],
  "summary": "2-3 sentences on retail availability",
  "truth_scores": {
    "objective_truth": number,
    "practical_truth": number,
    "completeness": number,
    "contextual_scope": number
  }
}

CRITICAL: Base analysis ONLY on provided results. Focus on actual products for sale, not just mentions.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type')
    }

    let jsonText = content.text.trim()
    const jsonMatch =
      jsonText.match(/```json\n([\s\S]*?)\n```/) ||
      jsonText.match(/```\n([\s\S]*?)\n```/)

    if (jsonMatch) {
      jsonText = jsonMatch[1]
    }

    return JSON.parse(jsonText)
  } catch (error) {
    console.error('Retail analysis error:', error)
    return {
      is_novel: false,
      confidence: 0.3,
      product_analyses: [],
      summary: 'Analysis failed. Manual review of search results recommended.',
      truth_scores: {
        objective_truth: 0.5,
        practical_truth: 0.4,
        completeness: 0.3,
        contextual_scope: 0.4,
      },
    }
  }
}

export async function runRetailSearchAgent(
  request: NoveltyCheckRequest
): Promise<NoveltyResult> {
  // Check if eBay is configured - if not, return "not configured" result
  // Previously this fell back to Brave, but that doubled Brave API usage
  // causing unexpected rate limit exhaustion
  if (!isEbayConfigured()) {
    console.log('eBay not configured, skipping retail search')
    return {
      agent_type: 'retail_search',
      is_novel: true, // Can't determine, so assume novel
      confidence: 0.3, // Low confidence due to no data
      findings: [],
      summary: 'Retail search skipped: eBay API not configured. To enable retail product search, add EBAY_CLIENT_ID and EBAY_CLIENT_SECRET environment variables. Visit https://developer.ebay.com/my/keys to get API keys.',
      truth_scores: {
        objective_truth: 0,
        practical_truth: 0,
        completeness: 0,
        contextual_scope: 0,
      },
      search_query_used: 'N/A - eBay not configured',
      timestamp: new Date(),
    }
  }

  // PHASE 1: Fetch real products from eBay
  const ebayResult = await searchSimilarProducts(
    request.invention_name,
    request.description,
    request.key_features
  )

  if (!ebayResult.success) {
    return {
      agent_type: 'retail_search',
      is_novel: false,
      confidence: 0,
      findings: [],
      summary: `eBay API error: ${ebayResult.error}`,
      truth_scores: {
        objective_truth: 0,
        practical_truth: 0,
        completeness: 0,
        contextual_scope: 0,
      },
      search_query_used: ebayResult.searchQuery,
      timestamp: new Date(),
    }
  }

  // If no products found, the invention may be very novel
  if (ebayResult.products.length === 0) {
    return {
      agent_type: 'retail_search',
      is_novel: true,
      confidence: 0.7, // Moderate confidence since absence != novelty
      findings: [],
      summary: `No similar products found on eBay for "${ebayResult.searchQuery}". This suggests the invention may be novel in the retail marketplace, though further research on other platforms is recommended.`,
      truth_scores: {
        objective_truth: 0.8,
        practical_truth: 0.7,
        completeness: 0.5, // Only checked eBay
        contextual_scope: 0.8,
      },
      search_query_used: ebayResult.searchQuery,
      timestamp: new Date(),
    }
  }

  // Convert to findings format (without similarity scores yet)
  const findings = ebayResult.products.map(ebayProductToFinding)

  // PHASE 2: Use Claude to analyze similarity of real products
  const analysisPrompt = `${ANALYSIS_PROMPT.role}

${ANALYSIS_PROMPT.task}

## How to Analyze:
${ANALYSIS_PROMPT.howTo}

## Invention to Check:
- **Name**: ${request.invention_name}
- **Description**: ${request.description}
- **Problem Statement**: ${request.problem_statement || 'Not provided'}
- **Target Audience**: ${request.target_audience || 'Not provided'}
- **Key Features**: ${request.key_features?.join(', ') || 'Not provided'}

## Real eBay Products Found (${ebayResult.products.length} results):
${ebayResult.products
  .map(
    (p, i) => `
${i + 1}. **${p.title}**
   - Item ID: ${p.itemId}
   - Price: ${p.price?.currency || 'USD'} ${p.price?.value || 'N/A'}
   - Condition: ${p.condition || 'Not specified'}
   - URL: ${p.itemWebUrl}
   - Categories: ${p.categories?.map((c) => c.categoryName).join(', ') || 'N/A'}
`
  )
  .join('\n')}

${ANALYSIS_PROMPT.output}

CRITICAL: Your analysis MUST be based on these REAL eBay listings. Do not invent or imagine products.
Products with higher similarity scores indicate the invention is LESS novel.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4096,
      messages: [{ role: 'user', content: analysisPrompt }],
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    // Extract JSON from response
    let jsonText = content.text.trim()
    const jsonMatch =
      jsonText.match(/```json\n([\s\S]*?)\n```/) ||
      jsonText.match(/```\n([\s\S]*?)\n```/)

    if (jsonMatch) {
      jsonText = jsonMatch[1]
    }

    const analysisResult = JSON.parse(jsonText)

    // Update findings with Claude's similarity scores
    const productAnalysisMap = new Map(
      analysisResult.product_analyses?.map(
        (a: { item_id: string; similarity_score: number; analysis: string }) => [
          a.item_id,
          a,
        ]
      ) || []
    )

    const updatedFindings = findings.map((finding) => {
      const analysis = productAnalysisMap.get(finding.metadata?.item_id)
      if (analysis) {
        return {
          ...finding,
          similarity_score: (analysis as { similarity_score: number }).similarity_score,
          description:
            (analysis as { analysis: string }).analysis || finding.description,
        }
      }
      return finding
    })

    // Sort by similarity score (highest first)
    updatedFindings.sort((a, b) => b.similarity_score - a.similarity_score)

    return {
      agent_type: 'retail_search',
      is_novel: analysisResult.is_novel,
      confidence: analysisResult.confidence,
      findings: updatedFindings,
      summary: analysisResult.summary,
      truth_scores: analysisResult.truth_scores,
      search_query_used: ebayResult.searchQuery,
      timestamp: new Date(),
    }
  } catch (error) {
    console.error('Retail Search Agent analysis error:', error)

    // Return findings without AI analysis if Claude fails
    return {
      agent_type: 'retail_search',
      is_novel: false,
      confidence: 0.3,
      findings: findings,
      summary: `Found ${findings.length} potentially similar products on eBay, but analysis failed. Manual review recommended.`,
      truth_scores: {
        objective_truth: 0.6, // Real data, but no analysis
        practical_truth: 0.5,
        completeness: 0.4,
        contextual_scope: 0.5,
      },
      search_query_used: ebayResult.searchQuery,
      timestamp: new Date(),
    }
  }
}
