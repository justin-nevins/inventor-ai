// Web Search Agent - Checks for existing products via Tavily Search API
// Two-Phase Approach:
// Phase 1: Call Tavily Search API to get REAL search results
// Phase 2: Pass real results to AI (Anthropic with OpenAI fallback) for novelty analysis

import type { NoveltyResult, NoveltyCheckRequest, NoveltyFinding, GraduatedTruthScores } from './types'
import {
  generateNoveltySearchQueries,
  runMultipleSearches,
  type TavilySearchResult,
} from '../search/tavily'
import { createCompletion } from './ai-client'

const NOVELTY_ANALYSIS_PROMPT = {
  role: `You are a market research specialist focused on product novelty assessment. You analyze real web search results to determine if similar products already exist.`,

  task: `Given an invention idea and REAL search results from the web, assess whether similar products already exist. Your analysis must be based solely on the provided search results - do not hallucinate or invent findings.`,

  howTo: `
1. Review the invention name, description, problem statement, and key features
2. Carefully analyze each search result provided
3. For each result, assess how similar it is to the proposed invention (0-1 scale)
4. Identify which results represent direct competitors vs partial solutions
5. Calculate overall novelty based on the closest matching results
6. If no results match closely, the invention may be novel
7. Provide honest confidence scores based on result quality
`,

  output: `Return a JSON object with this exact structure:
{
  "is_novel": boolean (true if no close matches found in results),
  "confidence": number (0-1, based on result quality and coverage),
  "analyzed_findings": [
    {
      "result_index": number (which search result this refers to),
      "similarity_score": number (0-1, how similar to the invention),
      "relevance_explanation": "Why this result is or isn't similar"
    }
  ],
  "summary": "2-3 sentence summary based ONLY on the actual search results",
  "truth_scores": {
    "objective_truth": number (0-1, based on verifiable search data),
    "practical_truth": number (0-1, how actionable for the inventor),
    "completeness": number (0-1, how well search results cover the space),
    "contextual_scope": number (0-1, relevance to user's specific context)
  },
  "recommended_next_searches": ["optional additional search queries if results were inconclusive"]
}`
}

interface AnalyzedFinding {
  result_index: number
  similarity_score: number
  relevance_explanation: string
}

interface ClaudeAnalysisResult {
  is_novel: boolean
  confidence: number
  analyzed_findings: AnalyzedFinding[]
  summary: string
  truth_scores: GraduatedTruthScores
  recommended_next_searches?: string[]
}

export async function runWebSearchAgent(
  request: NoveltyCheckRequest,
  preGeneratedQueries?: string[]
): Promise<NoveltyResult> {
  try {
    // ========================================
    // PHASE 1: Get REAL search results from Brave API
    // ========================================

    // Use pre-generated queries from AI expansion, or generate new ones
    const searchQueries = preGeneratedQueries?.length
      ? preGeneratedQueries
      : generateNoveltySearchQueries(
          request.invention_name,
          request.description,
          request.problem_statement,
          request.key_features
        )

    console.log(`[Web Search Agent] Using ${preGeneratedQueries ? 'AI-optimized' : 'auto-generated'} queries:`, searchQueries)

    // Run multiple searches to get comprehensive results
    const searchResponse = await runMultipleSearches(searchQueries, 5)

    // Handle API errors
    if (searchResponse.error && searchResponse.results.length === 0) {
      return {
        agent_type: 'web_search',
        is_novel: false,
        confidence: 0,
        findings: [],
        summary: `Search failed: ${searchResponse.error}`,
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

    // If no results found, that's actually a good sign for novelty
    if (searchResponse.results.length === 0) {
      return {
        agent_type: 'web_search',
        is_novel: true,
        confidence: 0.6, // Moderate confidence - absence of results doesn't prove novelty
        findings: [],
        summary: 'No similar products found in web search. This suggests the invention may be novel, but further research (retail and patent searches) is recommended.',
        truth_scores: {
          objective_truth: 0.7,
          practical_truth: 0.6,
          completeness: 0.4,
          contextual_scope: 0.5,
        },
        search_query_used: searchQueries.join(' | '),
        timestamp: new Date(),
      }
    }

    // ========================================
    // PHASE 2: Pass real results to Claude for analysis
    // ========================================

    const analysisResult = await analyzeSearchResults(
      request,
      searchResponse.results,
      searchQueries
    )

    // Convert Claude's analysis to NoveltyFindings with real URLs
    const findings: NoveltyFinding[] = searchResponse.results.map((result, index) => {
      const analysis = analysisResult.analyzed_findings.find(
        (f) => f.result_index === index
      )

      return {
        title: result.title,
        description: result.description,
        url: result.url, // REAL URL from Tavily Search
        similarity_score: analysis?.similarity_score ?? 0.3,
        source: 'Tavily Search',
        metadata: {
          relevance_explanation: analysis?.relevance_explanation,
          relevance_score: result.score, // Tavily relevance score
          age: result.age,
        },
      }
    })

    // Sort by similarity score (most similar first)
    findings.sort((a, b) => b.similarity_score - a.similarity_score)

    return {
      agent_type: 'web_search',
      is_novel: analysisResult.is_novel,
      confidence: analysisResult.confidence,
      findings: findings.slice(0, 10), // Return top 10 most relevant
      summary: analysisResult.summary,
      truth_scores: analysisResult.truth_scores,
      search_query_used: searchQueries.join(' | '),
      timestamp: new Date(),
    }
  } catch (error) {
    console.error('Web Search Agent error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return {
      agent_type: 'web_search',
      is_novel: false,
      confidence: 0,
      findings: [],
      summary: `Error during web search analysis: ${errorMessage}`,
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

/**
 * Use Claude to analyze real search results for novelty
 */
async function analyzeSearchResults(
  request: NoveltyCheckRequest,
  searchResults: TavilySearchResult[],
  queriesUsed: string[]
): Promise<ClaudeAnalysisResult> {
  // Format search results for Claude
  const formattedResults = searchResults
    .map(
      (result, index) =>
        `[Result ${index}]
Title: ${result.title}
URL: ${result.url}
Description: ${result.description}
${result.age ? `Age: ${result.age}` : ''}`
    )
    .join('\n\n')

  const prompt = `${NOVELTY_ANALYSIS_PROMPT.role}

${NOVELTY_ANALYSIS_PROMPT.task}

## How to Analyze:
${NOVELTY_ANALYSIS_PROMPT.howTo}

## Invention Details:
- **Name**: ${request.invention_name}
- **Description**: ${request.description}
- **Problem Statement**: ${request.problem_statement || 'Not provided'}
- **Target Audience**: ${request.target_audience || 'Not provided'}
- **Key Features**: ${request.key_features?.join(', ') || 'Not provided'}

## Search Queries Used:
${queriesUsed.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

## REAL Search Results (${searchResults.length} total):
${formattedResults}

${NOVELTY_ANALYSIS_PROMPT.output}

CRITICAL: Base your analysis ONLY on the search results provided above. Do not invent or imagine products that aren't in the results. Be honest about what the results do and don't tell us.`

  // Use AI client with automatic Anthropic → OpenAI fallback
  const response = await createCompletion(prompt, undefined, {
    model: 'claude-3-haiku-20240307',
    maxTokens: 2048,
  })

  console.log(`[Web Search Agent] Analysis completed via ${response.provider} (${response.model})`)

  // Extract JSON from response
  let jsonText = response.text.trim()
  const jsonMatch =
    jsonText.match(/```json\n([\s\S]*?)\n```/) ||
    jsonText.match(/```\n([\s\S]*?)\n```/)

  if (jsonMatch) {
    jsonText = jsonMatch[1]
  }

  const result: ClaudeAnalysisResult = JSON.parse(jsonText)
  return result
}
