// Patent Search Agent - Hybrid Approach
// Phase 1: Fetch REAL patent data from PatentsView (all patents) + PTAB (challenged patents)
// Phase 2: Pass real data to AI (Anthropic with OpenAI fallback) for novelty analysis
//
// PatentsView: 12M+ granted US patents (comprehensive coverage)
// PTAB: Challenged patents, IPR/PGR/CBM trials, appeals (marks high-risk areas)

import type { NoveltyResult, NoveltyCheckRequest, NoveltyFinding } from './types'
import {
  searchUSPTOWithMultipleQueries,
  searchPatentsViewWithQueries,
  mergePatentResults,
  generatePatentSearchQueries,
  type PatentReference,
  type PatentQuerySet,
} from '../search/uspto'
import { withRetry } from '../search/retry'
import { createCompletion } from './ai-client'

const PATENT_ANALYSIS_PROMPT = {
  role: `You are a patent research specialist with expertise in prior art analysis and novelty assessment. You analyze REAL patent data from USPTO databases to assess patentability.`,

  task: `Analyze the provided invention against REAL patent search results from USPTO databases (PatentsView for all granted patents + PTAB for challenged patents). Assess similarity, potential conflicts, and overall novelty.`,

  howTo: `
1. Review the invention details carefully
2. Analyze EACH patent in the search results for relevance
3. For each patent, assess:
   - How similar is it to the invention? (0-1 score)
   - Does it cover the same problem space?
   - Would its claims potentially cover this invention?
   - Is it expired, active, or pending?
   - If marked as "challenged" (from PTAB), note this increases risk
4. Identify the most threatening prior art
5. Consider if there are gaps that make the invention patentable
6. Assess overall novelty based on the REAL patent data provided
7. Provide actionable recommendations
`,

  output: `Return a JSON object with this exact structure:
{
  "is_novel": boolean (true if likely patentable based on the patents found),
  "confidence": number (0-1, how confident based on search coverage),
  "analyzed_patents": [
    {
      "patent_number": "the patent number from the data",
      "title": "title from the data",
      "similarity_score": number (0-1, how similar to the invention),
      "threat_level": "high" | "medium" | "low" | "none",
      "analysis": "2-3 sentences explaining relevance and potential conflict"
    }
  ],
  "summary": "2-3 sentences on patent landscape and patentability assessment based on REAL data",
  "patentability_assessment": "detailed assessment of likelihood of getting a patent",
  "key_differentiators": ["aspects that make this invention different from found patents"],
  "recommendations": ["next steps for patent search or filing"],
  "search_coverage_notes": "notes on what the search did or didn't cover"
}`
}

interface PatentAnalysis {
  patent_number: string
  title: string
  similarity_score: number
  threat_level: 'high' | 'medium' | 'low' | 'none'
  analysis: string
}

interface AnalysisResult {
  is_novel: boolean
  confidence: number
  analyzed_patents: PatentAnalysis[]
  summary: string
  patentability_assessment: string
  key_differentiators: string[]
  recommendations: string[]
  search_coverage_notes: string
}

/**
 * Converts USPTO PatentReference to NoveltyFinding format
 */
function patentReferenceToFinding(
  patent: PatentReference,
  analysis?: PatentAnalysis
): NoveltyFinding {
  // Determine source display name
  let sourceName = 'USPTO PTAB'
  if (patent.source === 'USPTO_PATENTSVIEW') {
    sourceName = patent.isChallenged ? 'USPTO (Challenged)' : 'USPTO Patents'
  } else if (patent.source === 'USPTO_APPEALS') {
    sourceName = 'USPTO Appeals'
  }

  // Build description from analysis or available data
  let description = analysis?.analysis || patent.relevanceContext || ''
  if (!description && patent.abstract) {
    description = patent.abstract.length > 200
      ? patent.abstract.slice(0, 200) + '...'
      : patent.abstract
  }
  if (!description) {
    description = patent.source === 'USPTO_PATENTSVIEW'
      ? 'Granted patent from USPTO database'
      : 'Patent found in USPTO PTAB database'
  }

  return {
    title: `${patent.title} (${patent.patentNumber})`,
    description,
    url: patent.url,
    similarity_score: analysis?.similarity_score ?? 0.5,
    source: sourceName,
    metadata: {
      patent_number: patent.patentNumber,
      filing_date: patent.filingDate,
      status: patent.status,
      trial_type: patent.trialType,
      threat_level: analysis?.threat_level,
      assignee: patent.assignee,
      is_challenged: patent.isChallenged,
    },
  }
}

/**
 * Phase 1: Fetch real patent data from PatentsView + PTAB
 * PatentsView = PRIMARY (all 12M+ granted patents)
 * PTAB = SUPPLEMENTARY (marks challenged patents, useful for risk assessment)
 *
 * Uses AI-powered query decomposition for better search coverage
 */
async function fetchPatents(request: NoveltyCheckRequest): Promise<{
  patents: PatentReference[]
  querySet: PatentQuerySet
  errors: string[]
  hasPatentsViewData: boolean
  hasPTABData: boolean
}> {
  // Generate AI-powered function-based queries
  console.log('[Patent Search] Generating AI-powered patent search queries...')

  const querySet = await generatePatentSearchQueries(
    request.invention_name,
    request.description,
    request.problem_statement,
    request.key_features
  )

  console.log('[Patent Search] Query types generated:')
  console.log(`  - Function queries: ${querySet.functionQueries.length}`)
  console.log(`  - Problem queries: ${querySet.problemQueries.length}`)
  console.log(`  - Mechanism queries: ${querySet.mechanismQueries.length}`)
  console.log(`  - Synonym queries: ${querySet.synonymQueries.length}`)
  console.log(`  - Total queries: ${querySet.allQueries.length}`)

  const allErrors: string[] = []
  let patentsViewPatents: PatentReference[] = []
  let ptabPatents: PatentReference[] = []
  let hasPatentsViewData = false
  let hasPTABData = false

  // Search PatentsView (PRIMARY) - all granted patents
  const patentsViewResult = await withRetry(async () => {
    const result = await searchPatentsViewWithQueries(querySet.allQueries, {
      maxResultsPerQuery: 10,
    })
    if (result.errors.some(e => e.includes('PATENTSVIEW_API_KEY'))) {
      throw new Error(result.errors[0])
    }
    if (result.errors.length > 0 && result.patents.length === 0) {
      throw new Error(result.errors[0])
    }
    return result
  }, { maxAttempts: 2, initialDelayMs: 1500 })

  // Process PatentsView results
  if (patentsViewResult.success && patentsViewResult.data) {
    patentsViewPatents = patentsViewResult.data.patents
    hasPatentsViewData = patentsViewPatents.length > 0
    allErrors.push(...patentsViewResult.data.errors)
    console.log(`[Patent Search] PatentsView: ${patentsViewPatents.length} patents found`)
  } else {
    const errMsg = patentsViewResult.lastError?.message || 'PatentsView search failed'
    if (!errMsg.includes('PATENTSVIEW_API_KEY')) {
      allErrors.push(`PatentsView: ${errMsg}`)
    } else {
      console.log('[Patent Search] PatentsView: API key not configured')
    }
  }

  // PTAB (SUPPLEMENTARY) - disabled, PatentsView covers all granted patents
  // To re-enable, uncomment the PTAB search block below:
  // const ptabResult = await withRetry(async () => {
  //   const result = await searchUSPTOWithMultipleQueries(querySet.allQueries, {
  //     maxResultsPerQuery: 5,
  //     includeProceedings: true,
  //     includeDecisions: true,
  //     includeAppeals: true,
  //   })
  //   if (result.errors.some(e => e.includes('USPTO_API_KEY'))) {
  //     throw new Error(result.errors[0])
  //   }
  //   if (result.errors.length > 0 && result.patents.length === 0) {
  //     throw new Error(result.errors[0])
  //   }
  //   return result
  // }, { maxAttempts: 2, initialDelayMs: 1500 })
  //
  // if (ptabResult.success && ptabResult.data) {
  //   ptabPatents = ptabResult.data.patents
  //   hasPTABData = ptabPatents.length > 0
  //   allErrors.push(...ptabResult.data.errors)
  //   console.log(`[Patent Search] PTAB: ${ptabPatents.length} challenged patents found`)
  // } else {
  //   const errMsg = ptabResult.lastError?.message || 'PTAB search failed'
  //   if (!errMsg.includes('USPTO_API_KEY')) {
  //     allErrors.push(`PTAB: ${errMsg}`)
  //   }
  // }

  const mergedPatents = patentsViewPatents

  console.log(`[Patent Search] Combined: ${mergedPatents.length} unique patents`)

  return {
    patents: mergedPatents,
    querySet,
    errors: allErrors,
    hasPatentsViewData,
    hasPTABData,
  }
}

/**
 * Phase 2: Analyze real patent data with Claude
 */
async function analyzePatentsWithClaude(
  request: NoveltyCheckRequest,
  patents: PatentReference[],
  querySet: PatentQuerySet
): Promise<AnalysisResult> {
  // Format patent data for Claude
  const patentSummaries = patents.map((p, i) => `
${i + 1}. Patent: ${p.patentNumber}
   Title: ${p.title}
   Filing Date: ${p.filingDate}
   Status: ${p.status}
   Source: ${p.source}
   Trial Type: ${p.trialType || 'N/A'}
   Context: ${p.relevanceContext || 'N/A'}
   URL: ${p.url}
`).join('\n')

  // Format query strategy for transparency
  const queryStrategy = `
**Function-based queries** (what it does): ${querySet.functionQueries.join(', ') || 'none'}
**Problem-based queries** (what it solves): ${querySet.problemQueries.join(', ') || 'none'}
**Mechanism queries** (how it works): ${querySet.mechanismQueries.join(', ') || 'none'}
**Synonym queries** (alternative terms): ${querySet.synonymQueries.join(', ') || 'none'}`

  const prompt = `${PATENT_ANALYSIS_PROMPT.role}

${PATENT_ANALYSIS_PROMPT.task}

## How to Analyze:
${PATENT_ANALYSIS_PROMPT.howTo}

## Invention to Analyze:
- **Name**: ${request.invention_name}
- **Description**: ${request.description}
- **Problem Statement**: ${request.problem_statement || 'Not provided'}
- **Target Audience**: ${request.target_audience || 'Not provided'}
- **Key Features**: ${request.key_features?.join(', ') || 'Not provided'}

## Search Strategy Used:
We searched USPTO databases using AI-generated function-based queries:
${queryStrategy}

## REAL USPTO Patent Search Results (${patents.length} patents found):
${patents.length > 0 ? patentSummaries : 'No patents found matching the search criteria.'}

${PATENT_ANALYSIS_PROMPT.output}

CRITICAL:
- Analyze ONLY the real patents provided above - do not invent or simulate any patents
- Patents from "USPTO_PATENTSVIEW" are from the comprehensive granted patents database
- Patents from "USPTO_PTAB" or "USPTO_APPEALS" are challenged patents - these indicate contested technology areas
- Patents marked with isChallenged=true have been involved in patent disputes
- If no patents were found, assess novelty based on that fact
- Be conservative in novelty assessment
- Consider if the search queries adequately covered the invention's key functions
- Recommend professional patent search before filing`

  const response = await createCompletion(prompt, undefined, {
    model: 'claude-3-haiku-20240307',
    maxTokens: 4096,
  })

  console.log(`[Patent Search Agent] Analysis via ${response.provider} (${response.model})`)

  // Extract JSON from response
  let jsonText = response.text.trim()
  const jsonMatch = jsonText.match(/```json\n([\s\S]*?)\n```/) ||
                    jsonText.match(/```\n([\s\S]*?)\n```/) ||
                    jsonText.match(/\{[\s\S]*\}/)

  if (jsonMatch) {
    jsonText = jsonMatch[1] || jsonMatch[0]
  }

  return JSON.parse(jsonText) as AnalysisResult
}

/**
 * Main patent search function - Hybrid approach
 * 1. Fetches REAL data from PatentsView (all patents) + PTAB (challenged patents)
 * 2. Analyzes real data with Claude
 */
export async function runPatentSearchAgent(
  request: NoveltyCheckRequest,
  preGeneratedQueries?: string[]
): Promise<NoveltyResult> {
  try {
    // Log if we have AI-optimized queries from expansion step
    if (preGeneratedQueries?.length) {
      console.log(`[Patent Search Agent] AI-expanded queries available:`, preGeneratedQueries)
      // Note: Patent search has its own sophisticated AI query generation
      // which produces function/problem/mechanism/synonym query sets
    }

    // Phase 1: Fetch patents from PatentsView (primary) + PTAB (supplementary)
    const { patents, querySet, errors, hasPatentsViewData, hasPTABData } = await fetchPatents(request)

    // Check if we have NO API access (PatentsView key missing)
    const patentsViewKeyMissing = errors.some(e => e.includes('PATENTSVIEW_API_KEY'))

    if (patentsViewKeyMissing) {
      return {
        agent_type: 'patent_search',
        is_novel: false,
        confidence: 0,
        findings: [],
        summary: 'PATENTSVIEW_API_KEY not configured. Please add it to your environment variables.',
        truth_scores: {
          objective_truth: 0,
          practical_truth: 0,
          completeness: 0,
          contextual_scope: 0,
        },
        search_query_used: querySet.allQueries.join('; '),
        timestamp: new Date(),
      }
    }

    // Check for API errors (server errors OR bad request errors)
    const apiErrors = errors.filter(e =>
      e.includes('500') || e.includes('Internal Server Error') ||
      e.includes('400') || e.includes('error') ||
      e.includes('failed')
    )

    // If we found no patents AND had API errors, we can't trust the results
    const allApisErrored = !hasPatentsViewData && apiErrors.length > 0
    if (allApisErrored) {
      return {
        agent_type: 'patent_search',
        is_novel: false,
        confidence: 0,
        findings: [],
        summary: `Patent search encountered errors (${apiErrors.length} requests failed). Unable to complete patent search. Please try again later or consult a patent attorney.`,
        truth_scores: {
          objective_truth: 0,
          practical_truth: 0.2,
          completeness: 0,
          contextual_scope: 0,
        },
        search_query_used: querySet.allQueries.join('; '),
        timestamp: new Date(),
      }
    }

    // Phase 2: Analyze with Claude
    const analysis = await analyzePatentsWithClaude(request, patents, querySet)

    // Build findings from real patent data + Claude's analysis
    const findings: NoveltyFinding[] = patents.map(patent => {
      const patentAnalysis = analysis.analyzed_patents?.find(
        ap => ap.patent_number === patent.patentNumber
      )
      return patentReferenceToFinding(patent, patentAnalysis)
    })

    // Sort findings by similarity score (most similar first)
    findings.sort((a, b) => b.similarity_score - a.similarity_score)

    // Calculate truth scores based on data sources
    // PatentsView = comprehensive (95%), PTAB-only = limited (25%)
    const queryDiversity = (
      (querySet.functionQueries.length > 0 ? 0.25 : 0) +
      (querySet.problemQueries.length > 0 ? 0.25 : 0) +
      (querySet.mechanismQueries.length > 0 ? 0.25 : 0) +
      (querySet.synonymQueries.length > 0 ? 0.25 : 0)
    )

    // Error penalty (reduce scores if APIs had partial failures)
    const errorRate = errors.length / Math.max(querySet.allQueries.length * 2, 1)
    const errorPenalty = errorRate > 0 ? (1 - errorRate * 0.3) : 1

    // Truth scores based on data source quality
    // PatentsView success = high scores (covers 95% of patents)
    // PTAB-only = low scores (covers <5% of patents)
    const truthScores = {
      objective_truth: hasPatentsViewData ? 0.95 * errorPenalty : (hasPTABData ? 0.6 * errorPenalty : 0),
      practical_truth: hasPatentsViewData ? 0.9 * errorPenalty : (hasPTABData ? 0.5 * errorPenalty : 0),
      completeness: hasPatentsViewData ? 0.85 * errorPenalty : (hasPTABData ? 0.25 * errorPenalty : 0),
      contextual_scope: hasPatentsViewData ? 0.9 * queryDiversity * errorPenalty : (hasPTABData ? 0.4 * queryDiversity * errorPenalty : 0),
    }

    return {
      agent_type: 'patent_search',
      is_novel: analysis.is_novel,
      confidence: analysis.confidence * errorPenalty,
      findings: findings.slice(0, 10), // Top 10 most relevant
      summary: buildSummary(analysis, patents.length, errors, querySet, hasPatentsViewData, hasPTABData),
      truth_scores: truthScores,
      search_query_used: querySet.allQueries.join('; '),
      timestamp: new Date(),
    }
  } catch (error) {
    console.error('Patent Search Agent error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return {
      agent_type: 'patent_search',
      is_novel: false,
      confidence: 0,
      findings: [],
      summary: `Error during patent search: ${errorMessage}. Professional patent search recommended.`,
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
 * Builds a comprehensive summary from the analysis
 */
function buildSummary(
  analysis: AnalysisResult,
  patentCount: number,
  errors: string[],
  querySet?: PatentQuerySet,
  hasPatentsViewData?: boolean,
  hasPTABData?: boolean
): string {
  const parts: string[] = []

  // Main summary from Claude's analysis
  parts.push(analysis.summary)

  // Add data source context
  if (patentCount > 0) {
    const sources: string[] = []
    if (hasPatentsViewData) sources.push('USPTO PatentsView (all granted patents)')
    if (hasPTABData) sources.push('USPTO PTAB (challenged patents)')
    parts.push(`\n\nBased on ${patentCount} real patents from ${sources.join(' + ')}.`)
  } else if (hasPatentsViewData) {
    parts.push('\n\nNo matching patents found in USPTO database (comprehensive search completed).')
  } else if (hasPTABData) {
    parts.push('\n\nNo matching patents found in USPTO PTAB (challenged patents only - limited coverage).')
  } else {
    parts.push('\n\nNo patent data retrieved.')
  }

  // Add search strategy info
  if (querySet && querySet.allQueries.length > 0) {
    const queryTypes = []
    if (querySet.functionQueries.length > 0) queryTypes.push('function-based')
    if (querySet.problemQueries.length > 0) queryTypes.push('problem-based')
    if (querySet.mechanismQueries.length > 0) queryTypes.push('mechanism')
    if (querySet.synonymQueries.length > 0) queryTypes.push('synonym-expanded')
    parts.push(`\n\nSearch strategy: ${querySet.allQueries.length} AI-generated queries (${queryTypes.join(', ')}).`)
  }

  // Add patentability assessment
  if (analysis.patentability_assessment) {
    parts.push(`\n\nPatentability: ${analysis.patentability_assessment}`)
  }

  // Add key differentiators
  if (analysis.key_differentiators?.length > 0) {
    parts.push(`\n\nKey differentiators: ${analysis.key_differentiators.join('; ')}`)
  }

  // Add search coverage notes
  if (analysis.search_coverage_notes) {
    parts.push(`\n\nNote: ${analysis.search_coverage_notes}`)
  }

  // Add any warnings
  if (errors.length > 0) {
    // Filter out "key not configured" errors from display
    const displayErrors = errors.filter(e => !e.includes('API_KEY'))
    if (displayErrors.length > 0) {
      parts.push(`\n\nSearch warnings: ${displayErrors.join('; ')}`)
    }
  }

  // Add coverage disclaimer based on data sources
  if (hasPatentsViewData) {
    parts.push('\n\nNOTE: This search covers granted US patents via PatentsView. A professional patent search is still recommended before filing.')
  } else if (hasPTABData) {
    parts.push('\n\nIMPORTANT: This search only covers USPTO PTAB (challenged patents, <5% of all patents). For comprehensive coverage, configure PATENTSVIEW_API_KEY or consult a patent attorney.')
  }

  return parts.join('')
}
