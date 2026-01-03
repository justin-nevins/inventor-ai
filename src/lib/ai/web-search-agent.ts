// Web Search Agent - Checks for existing products via web search

import Anthropic from '@anthropic-ai/sdk'
import type { NoveltyResult, NoveltyCheckRequest, GraduatedTruthScores } from './types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const WEB_SEARCH_PROMPT = {
  role: `You are a market research specialist focused on product novelty assessment. Your expertise is in identifying whether products already exist in the marketplace through web research.`,

  task: `Analyze the provided invention details and determine if similar products already exist on the web. Assess novelty and provide specific findings.`,

  howTo: `
1. Review the invention name, description, problem statement, and key features
2. Identify the core innovation and unique selling propositions
3. Consider what search queries would find similar products
4. Simulate searching for: exact product name, problem + solution, key features
5. Identify potential competitors or similar existing solutions
6. Assess similarity on a scale of 0-1 (0 = completely different, 1 = identical)
7. Calculate overall novelty score (1 = highly novel/unique, 0 = already exists)
8. Provide truth scores for your assessment
`,

  output: `Return a JSON object with this exact structure:
{
  "is_novel": boolean,
  "confidence": number (0-1),
  "findings": [
    {
      "title": "Product/Article Title",
      "description": "Brief description of what was found",
      "url": "https://example.com (hypothetical based on likely search results)",
      "similarity_score": number (0-1),
      "source": "Google Search" or similar,
      "metadata": {}
    }
  ],
  "summary": "2-3 sentence summary of novelty assessment",
  "truth_scores": {
    "objective_truth": number (0-1),
    "practical_truth": number (0-1),
    "completeness": number (0-1),
    "contextual_scope": number (0-1)
  },
  "search_query_used": "best search query for this product"
}`
}

export async function runWebSearchAgent(
  request: NoveltyCheckRequest
): Promise<NoveltyResult> {
  const prompt = `${WEB_SEARCH_PROMPT.role}

${WEB_SEARCH_PROMPT.task}

## How to Assess:
${WEB_SEARCH_PROMPT.howTo}

## Invention Details:
- **Name**: ${request.invention_name}
- **Description**: ${request.description}
- **Problem Statement**: ${request.problem_statement || 'Not provided'}
- **Target Audience**: ${request.target_audience || 'Not provided'}
- **Key Features**: ${request.key_features?.join(', ') || 'Not provided'}

${WEB_SEARCH_PROMPT.output}

IMPORTANT: Base your assessment on realistic expectations of what would likely be found in web searches. Consider:
- Existing products solving the same problem
- Similar solutions with different approaches
- Partial solutions that address some aspects
- Competitive products in the same space

Be honest and thorough. If similar products likely exist, identify them.`

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

    // Extract JSON from response (may be wrapped in markdown code blocks)
    let jsonText = content.text.trim()
    const jsonMatch = jsonText.match(/```json\n([\s\S]*?)\n```/) ||
                      jsonText.match(/```\n([\s\S]*?)\n```/)

    if (jsonMatch) {
      jsonText = jsonMatch[1]
    }

    const result = JSON.parse(jsonText)

    return {
      agent_type: 'web_search',
      is_novel: result.is_novel,
      confidence: result.confidence,
      findings: result.findings,
      summary: result.summary,
      truth_scores: result.truth_scores,
      search_query_used: result.search_query_used,
      timestamp: new Date(),
    }
  } catch (error) {
    console.error('Web Search Agent error:', error)

    // Return a safe fallback result
    return {
      agent_type: 'web_search',
      is_novel: false, // Conservative default
      confidence: 0,
      findings: [],
      summary: 'Error occurred during web search analysis. Unable to assess novelty.',
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
