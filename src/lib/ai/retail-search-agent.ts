// Retail Search Agent - Checks Amazon, Walmart, eBay for existing products

import Anthropic from '@anthropic-ai/sdk'
import type { NoveltyResult, NoveltyCheckRequest } from './types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const RETAIL_SEARCH_PROMPT = {
  role: `You are a retail market analyst specializing in product discovery across major e-commerce platforms (Amazon, Walmart, eBay, Target, etc.). Your expertise is identifying whether products are already being sold commercially.`,

  task: `Analyze the provided invention and determine if similar products are already available for purchase on major retail platforms. Focus on commercial availability and market presence.`,

  howTo: `
1. Review the invention details (name, description, problem it solves, key features)
2. Identify the product category and likely retail classifications
3. Consider what terms consumers would use to search for this product
4. Simulate searches on Amazon, Walmart, eBay, and other major retailers
5. Look for:
   - Exact product matches
   - Products solving the same problem differently
   - Products with similar core features
   - Competitive products in the same category
6. For each finding, assess similarity (0-1 scale)
7. Determine if the invention would compete directly with existing products
8. Calculate novelty score based on commercial availability
`,

  output: `Return a JSON object with this exact structure:
{
  "is_novel": boolean (true if NOT already sold commercially),
  "confidence": number (0-1, confidence in assessment),
  "findings": [
    {
      "title": "Product Name (ASIN: B0XXXXX if Amazon)",
      "description": "What this product does and how it's similar",
      "url": "https://amazon.com/... (realistic product URL)",
      "similarity_score": number (0-1),
      "source": "Amazon" | "Walmart" | "eBay" | "Target",
      "metadata": {
        "price_range": "estimated price",
        "reviews_count": "estimated review count",
        "category": "product category"
      }
    }
  ],
  "summary": "2-3 sentences on retail availability and competition",
  "truth_scores": {
    "objective_truth": number (0-1),
    "practical_truth": number (0-1),
    "completeness": number (0-1),
    "contextual_scope": number (0-1)
  },
  "search_query_used": "best retail search query"
}`
}

export async function runRetailSearchAgent(
  request: NoveltyCheckRequest
): Promise<NoveltyResult> {
  const prompt = `${RETAIL_SEARCH_PROMPT.role}

${RETAIL_SEARCH_PROMPT.task}

## How to Assess:
${RETAIL_SEARCH_PROMPT.howTo}

## Invention to Analyze:
- **Name**: ${request.invention_name}
- **Description**: ${request.description}
- **Problem Statement**: ${request.problem_statement || 'Not provided'}
- **Target Audience**: ${request.target_audience || 'Not provided'}
- **Key Features**: ${request.key_features?.join(', ') || 'Not provided'}

${RETAIL_SEARCH_PROMPT.output}

IMPORTANT:
- Focus on products currently available for purchase
- Consider both direct competitors and alternative solutions
- Include price ranges and market positioning
- Be realistic about what's likely already on major retail platforms
- High similarity (>0.7) means product is essentially already available
- Medium similarity (0.4-0.7) means competitive alternatives exist
- Low similarity (<0.4) means novel product with few direct competitors`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    // Extract JSON from response
    let jsonText = content.text.trim()
    const jsonMatch = jsonText.match(/```json\n([\s\S]*?)\n```/) ||
                      jsonText.match(/```\n([\s\S]*?)\n```/)

    if (jsonMatch) {
      jsonText = jsonMatch[1]
    }

    const result = JSON.parse(jsonText)

    return {
      agent_type: 'retail_search',
      is_novel: result.is_novel,
      confidence: result.confidence,
      findings: result.findings,
      summary: result.summary,
      truth_scores: result.truth_scores,
      search_query_used: result.search_query_used,
      timestamp: new Date(),
    }
  } catch (error) {
    console.error('Retail Search Agent error:', error)

    return {
      agent_type: 'retail_search',
      is_novel: false,
      confidence: 0,
      findings: [],
      summary: 'Error occurred during retail search analysis. Unable to assess commercial availability.',
      truth_scores: {
        objective_truth: 0,
        practical_truth: 0,
        completeness: 0,
        contextual_scope: 0,
      },
      search_query_used: request.invention_name,
      timestamp: new Date(),
    }
  }
}
