// Patent Search Agent - Two-Phase Approach
// Phase 1: Fetch REAL patent data from USPTO PTAB API
// Phase 2: Pass real data to Claude for novelty analysis

import Anthropic from '@anthropic-ai/sdk'
import type { NoveltyResult, NoveltyCheckRequest, NoveltyFinding } from './types'
import {
  searchUSPTOComprehensive,
  extractPatentKeywords,
  type PatentReference,
} from '../search/uspto'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const PATENT_ANALYSIS_PROMPT = {
  role: `You are a patent research specialist with expertise in prior art analysis and novelty assessment. You analyze REAL patent data from USPTO searches to assess patentability.`,

  task: `Analyze the provided invention against REAL patent search results from the USPTO PTAB database. Assess similarity, potential conflicts, and overall novelty.`,

  howTo: `
1. Review the invention details carefully
2. Analyze EACH patent in the search results for relevance
3. For each patent, assess:
   - How similar is it to the invention? (0-1 score)
   - Does it cover the same problem space?
   - Would its claims potentially cover this invention?
   - Is it expired, active, or pending?
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
  return {
    title: `${patent.title} (${patent.patentNumber})`,
    description: analysis?.analysis || patent.relevanceContext || 'Patent found in USPTO PTAB database',
    url: patent.url,
    similarity_score: analysis?.similarity_score ?? 0.5,
    source: patent.source === 'USPTO_APPEALS' ? 'USPTO Appeals' : 'USPTO PTAB',
    metadata: {
      patent_number: patent.patentNumber,
      filing_date: patent.filingDate,
      status: patent.status,
      trial_type: patent.trialType,
      threat_level: analysis?.threat_level,
    },
  }
}

/**
 * Phase 1: Fetch real patent data from USPTO PTAB API
 */
async function fetchUSPTOPatents(request: NoveltyCheckRequest): Promise<{
  patents: PatentReference[]
  keywords: string[]
  errors: string[]
}> {
  // Extract relevant keywords for patent search
  const keywords = extractPatentKeywords(
    request.invention_name,
    request.description,
    request.key_features
  )

  console.log('[Patent Search] Searching USPTO with keywords:', keywords.slice(0, 5))

  // Search USPTO PTAB API
  const searchResult = await searchUSPTOComprehensive(keywords, {
    maxResultsPerEndpoint: 15,
    includeProceedings: true,
    includeDecisions: true,
    includeAppeals: true,
  })

  if (searchResult.errors.length > 0) {
    console.warn('[Patent Search] USPTO API warnings:', searchResult.errors)
  }

  console.log(`[Patent Search] Found ${searchResult.patents.length} patents (total in database: ${searchResult.totalCount})`)

  return {
    patents: searchResult.patents,
    keywords,
    errors: searchResult.errors,
  }
}

/**
 * Phase 2: Analyze real patent data with Claude
 */
async function analyzePatentsWithClaude(
  request: NoveltyCheckRequest,
  patents: PatentReference[],
  keywords: string[]
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

## Search Keywords Used:
${keywords.join(', ')}

## REAL USPTO PTAB Patent Search Results (${patents.length} patents found):
${patents.length > 0 ? patentSummaries : 'No patents found matching the search criteria.'}

${PATENT_ANALYSIS_PROMPT.output}

CRITICAL:
- Analyze ONLY the real patents provided above - do not invent or simulate any patents
- If no patents were found, assess novelty based on that fact but note limited search coverage
- Be conservative in novelty assessment
- Note that PTAB data includes challenged patents and appeals, which may indicate contested areas
- Always recommend professional patent search for comprehensive coverage`

  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
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

  return JSON.parse(jsonText) as AnalysisResult
}

/**
 * Main patent search function - Two-phase approach
 * 1. Fetches REAL data from USPTO PTAB API
 * 2. Analyzes real data with Claude
 */
export async function runPatentSearchAgent(
  request: NoveltyCheckRequest
): Promise<NoveltyResult> {
  try {
    // Phase 1: Fetch real USPTO data
    const { patents, keywords, errors } = await fetchUSPTOPatents(request)

    // Check if we have API access
    const apiKeyMissing = errors.some(e => e.includes('USPTO_API_KEY'))
    if (apiKeyMissing) {
      return {
        agent_type: 'patent_search',
        is_novel: false,
        confidence: 0,
        findings: [],
        summary: 'USPTO API key not configured. Please add USPTO_API_KEY to your environment variables to enable real patent searches.',
        truth_scores: {
          objective_truth: 0,
          practical_truth: 0,
          completeness: 0,
          contextual_scope: 0,
        },
        search_query_used: keywords.join(', '),
        timestamp: new Date(),
      }
    }

    // Phase 2: Analyze with Claude
    const analysis = await analyzePatentsWithClaude(request, patents, keywords)

    // Build findings from real patent data + Claude's analysis
    const findings: NoveltyFinding[] = patents.map(patent => {
      const patentAnalysis = analysis.analyzed_patents?.find(
        ap => ap.patent_number === patent.patentNumber
      )
      return patentReferenceToFinding(patent, patentAnalysis)
    })

    // Sort findings by similarity score (most similar first)
    findings.sort((a, b) => b.similarity_score - a.similarity_score)

    // Calculate truth scores based on real data
    const dataCompleteness = patents.length > 0 ? Math.min(1, patents.length / 20) : 0.1
    const hasRealData = patents.length > 0

    return {
      agent_type: 'patent_search',
      is_novel: analysis.is_novel,
      confidence: analysis.confidence,
      findings: findings.slice(0, 10), // Top 10 most relevant
      summary: buildSummary(analysis, patents.length, errors),
      truth_scores: {
        objective_truth: hasRealData ? 0.9 : 0.3, // High if using real data
        practical_truth: hasRealData ? 0.8 : 0.4,
        completeness: dataCompleteness * 0.7, // PTAB is subset of all patents
        contextual_scope: hasRealData ? 0.85 : 0.3,
      },
      search_query_used: keywords.join(', '),
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
function buildSummary(analysis: AnalysisResult, patentCount: number, errors: string[]): string {
  const parts: string[] = []

  // Main summary from Claude's analysis
  parts.push(analysis.summary)

  // Add data source context
  if (patentCount > 0) {
    parts.push(`\n\nBased on ${patentCount} real patents from USPTO PTAB database.`)
  } else {
    parts.push('\n\nNo matching patents found in USPTO PTAB database.')
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
    parts.push(`\n\nSearch warnings: ${errors.join('; ')}`)
  }

  // Always add disclaimer
  parts.push('\n\nIMPORTANT: This search covers USPTO PTAB (challenged patents, IPR/PGR/CBM trials, and appeals) which is a subset of all patents. A comprehensive patent search by a qualified patent attorney is recommended before filing.')

  return parts.join('')
}
