// AI-powered invention expansion for optimized novelty search
// Transforms brief user descriptions into comprehensive, search-ready profiles

import type { NoveltyCheckRequest } from './types'
import { createCompletion } from './ai-client'

/**
 * Expanded invention profile with AI-generated search queries
 */
export interface ExpandedInvention {
  // Enhanced description (2-3 technical sentences)
  expanded_description: string
  // Extracted/inferred key features (5 items)
  key_features: string[]
  // Product category for better search targeting
  product_category: string
  // What makes this invention unique vs existing products
  differentiators: string[]
  // Optimized search queries by type
  web_queries: string[]
  retail_queries: string[]
  patent_queries: string[]
}

const EXPANSION_PROMPT = `You are a product analyst specializing in invention assessment and search optimization.

## Task
Transform a brief invention description into a comprehensive, search-ready profile. Your goal is to:
1. Understand what the invention actually does
2. Extract the key differentiating features
3. Generate optimized search queries for finding similar products

## Input
Name: {invention_name}
Description: {description}
Problem: {problem_statement}
Audience: {target_audience}

## Output (JSON only, no markdown code blocks)
{
  "expanded_description": "2-3 sentence technical description that clearly explains what the invention does and how",
  "key_features": ["feature1", "feature2", "feature3", "feature4", "feature5"],
  "product_category": "Single category like 'Kitchen Products' or 'Pet Supplies'",
  "differentiators": ["what makes this unique vs existing products"],
  "web_queries": ["3-5 queries for finding similar products online"],
  "retail_queries": ["3-5 queries for Amazon/eBay product search"],
  "patent_queries": ["3-5 technical queries for patent databases"]
}

## Guidelines
- key_features: Extract 5 specific, concrete features (not vague like "innovative" or "smart")
- web_queries: Use natural language, product-focused terms
- retail_queries: Use shopping-style keywords that would appear in product titles
- patent_queries: Use technical/functional language (apparatus, device, method, mechanism)
- differentiators: Focus on what's NOVEL - what existing products don't do

## Example
Input:
Name: Spice Buddies
Description: spice set for children that has authentic smells but doesnt leak the spice out

Output:
{
  "expanded_description": "A child-safe spice exploration kit featuring sealed containers with smell-permeable membranes that allow authentic spice aromas to be experienced without exposing children to actual spices. Designed for sensory education and safe kitchen exploration.",
  "key_features": [
    "Smell-permeable sealed containers",
    "Child-safe design preventing spice access",
    "Authentic spice aromas preserved",
    "Educational sensory experience",
    "Leak-proof spill-resistant construction"
  ],
  "product_category": "Children's Educational Toys",
  "differentiators": [
    "Smell without exposure - existing spice kits give direct access to spices",
    "Specifically designed for young children's sensory education",
    "Safety-first approach with sealed aromatic chambers"
  ],
  "web_queries": [
    "kids sensory spice learning kit",
    "children smell education toys",
    "child safe cooking education set",
    "sensory play kitchen toys"
  ],
  "retail_queries": [
    "kids sensory toys smell",
    "children cooking learning set",
    "sensory play kit toddler",
    "pretend play spice set kids"
  ],
  "patent_queries": [
    "aromatic container smell permeable child safe",
    "sealed spice dispenser educational apparatus",
    "olfactory learning device children",
    "scent release container safety mechanism"
  ]
}`

/**
 * Expand an invention description using AI to generate optimized search queries
 *
 * @param request - The novelty check request with invention details
 * @returns Expanded invention with optimized queries, or fallback if AI fails
 */
export async function expandInvention(
  request: NoveltyCheckRequest
): Promise<ExpandedInvention> {
  const prompt = EXPANSION_PROMPT
    .replace('{invention_name}', request.invention_name)
    .replace('{description}', request.description)
    .replace('{problem_statement}', request.problem_statement || 'Not provided')
    .replace('{target_audience}', request.target_audience || 'Not provided')

  try {
    const response = await createCompletion(prompt, undefined, {
      model: 'claude-3-haiku-20240307',
      maxTokens: 1500,
      temperature: 0.3, // Slight creativity for query variety
    })

    console.log(`[Expand Invention] AI expansion via ${response.provider} (${response.model})`)

    // Extract JSON from response (handle markdown code blocks)
    let jsonText = response.text.trim()
    const jsonMatch =
      jsonText.match(/```json\n([\s\S]*?)\n```/) ||
      jsonText.match(/```\n([\s\S]*?)\n```/) ||
      jsonText.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      jsonText = jsonMatch[1] || jsonMatch[0]
    }

    const parsed = JSON.parse(jsonText) as ExpandedInvention

    // Validate required fields exist
    if (!parsed.expanded_description || !parsed.key_features || !parsed.web_queries) {
      throw new Error('Missing required fields in AI response')
    }

    // Ensure arrays have content
    return {
      expanded_description: parsed.expanded_description,
      key_features: parsed.key_features.slice(0, 5),
      product_category: parsed.product_category || 'General',
      differentiators: parsed.differentiators || [],
      web_queries: parsed.web_queries.slice(0, 5),
      retail_queries: parsed.retail_queries?.slice(0, 5) || parsed.web_queries.slice(0, 3),
      patent_queries: parsed.patent_queries?.slice(0, 5) || [],
    }
  } catch (error) {
    console.error('[Expand Invention] AI expansion failed, using fallback:', error)

    // Fallback: return basic expansion without AI
    return createFallbackExpansion(request)
  }
}

/**
 * Create a basic fallback expansion when AI fails
 */
function createFallbackExpansion(request: NoveltyCheckRequest): ExpandedInvention {
  // Extract keywords from description (basic)
  const keywords = request.description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3)
    .slice(0, 5)

  const basicQuery = `${request.invention_name} ${keywords.slice(0, 3).join(' ')}`

  return {
    expanded_description: request.description,
    key_features: request.key_features || [],
    product_category: 'General',
    differentiators: [],
    web_queries: [basicQuery, request.invention_name],
    retail_queries: [request.invention_name, basicQuery],
    patent_queries: [request.invention_name],
  }
}
