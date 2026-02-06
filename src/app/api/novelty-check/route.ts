// Novelty Check API - Runs 3 agents in parallel
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { runWebSearchAgent } from '@/lib/ai/web-search-agent'
import { runRetailSearchAgent } from '@/lib/ai/retail-search-agent'
import { runPatentSearchAgent } from '@/lib/ai/patent-search-agent'
import type { NoveltyCheckRequest, NoveltyCheckResponse, GraduatedTruthScores, RiskLevel, NoveltyFinding, ExpandedInvention } from '@/lib/ai/types'
import type { AiMemoryInsert, Json } from '@/types/database'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { invention_name, description, problem_statement, target_audience, key_features, projectId, expanded } = body as {
      invention_name: string
      description: string
      problem_statement?: string
      target_audience?: string
      key_features?: string[]
      projectId?: string
      expanded?: ExpandedInvention
    }

    if (!invention_name || !description) {
      return NextResponse.json(
        { error: 'invention_name and description are required' },
        { status: 400 }
      )
    }

    // Use expanded key_features if available
    const noveltyRequest: NoveltyCheckRequest = {
      invention_name,
      description: expanded?.expanded_description || description,
      problem_statement,
      target_audience,
      key_features: expanded?.key_features || key_features,
    }

    // Run all 3 agents in parallel for speed
    // Pass pre-generated queries from AI expansion if available
    const [webResult, retailResult, patentResult] = await Promise.all([
      runWebSearchAgent(noveltyRequest, expanded?.web_queries),
      runRetailSearchAgent(noveltyRequest, expanded?.retail_queries),
      runPatentSearchAgent(noveltyRequest, expanded?.patent_queries),
    ])

    // Detect failed agents (completeness === 0 means API failed)
    const webFailed = webResult.truth_scores.completeness === 0
    const retailFailed = retailResult.truth_scores.completeness === 0
    const patentFailed = patentResult.truth_scores.completeness === 0
    const anyAgentFailed = webFailed || retailFailed || patentFailed

    // Calculate scores - use 0.5 (unknown) for failed agents instead of calculating from empty findings
    // This prevents failed APIs from artificially inflating novelty scores
    const webScore = webFailed ? 0.5 :
      (webResult.is_novel ? 1 : (1 - Math.max(...webResult.findings.map(f => f.similarity_score), 0)))
    const retailScore = retailFailed ? 0.5 :
      (retailResult.is_novel ? 1 : (1 - Math.max(...retailResult.findings.map(f => f.similarity_score), 0)))
    const patentScore = patentFailed ? 0.5 :
      (patentResult.is_novel ? 1 : (1 - Math.max(...patentResult.findings.map(f => f.similarity_score), 0)))

    // Weighted average: Web 30%, Retail 30%, Patent 40%
    const overall_novelty_score = (webScore * 0.3) + (retailScore * 0.3) + (patentScore * 0.4)

    // Gather all findings for risk assessment
    const allFindings: NoveltyFinding[] = [
      ...webResult.findings,
      ...retailResult.findings,
      ...patentResult.findings,
    ]
    const maxSimilarity = allFindings.length > 0
      ? Math.max(...allFindings.map(f => f.similarity_score))
      : 0
    const hasHighConflict = maxSimilarity >= 0.8

    // Determine risk level based on findings and failures
    // PRIORITY: High-conflict findings override incomplete status!
    // If we found an existing matching product, that's the critical info - even if some APIs failed
    let risk_level: RiskLevel
    if (hasHighConflict) {
      // Found near-exact matches - this is the most important signal
      risk_level = 'high_risk'
    } else if (anyAgentFailed && allFindings.length === 0) {
      // Agents failed AND no findings at all - we don't know anything
      risk_level = 'incomplete'
    } else if (anyAgentFailed) {
      // Some agents failed but we have SOME data - show what we found
      // If we found moderate matches, still show that risk
      if (maxSimilarity >= 0.5) {
        risk_level = 'moderate_risk'
      } else {
        risk_level = 'incomplete'
      }
    } else if (maxSimilarity >= 0.5) {
      risk_level = 'moderate_risk'
    } else {
      risk_level = 'low_risk'
    }

    // Calculate overall truth scores (average of all agents)
    const avgTruthScores: GraduatedTruthScores = {
      objective_truth: (
        webResult.truth_scores.objective_truth +
        retailResult.truth_scores.objective_truth +
        patentResult.truth_scores.objective_truth
      ) / 3,
      practical_truth: (
        webResult.truth_scores.practical_truth +
        retailResult.truth_scores.practical_truth +
        patentResult.truth_scores.practical_truth
      ) / 3,
      completeness: (
        webResult.truth_scores.completeness +
        retailResult.truth_scores.completeness +
        patentResult.truth_scores.completeness
      ) / 3,
      contextual_scope: (
        webResult.truth_scores.contextual_scope +
        retailResult.truth_scores.contextual_scope +
        patentResult.truth_scores.contextual_scope
      ) / 3,
    }

    // Generate recommendation based on RISK LEVEL (not just score)
    // This ensures high-conflict findings override high novelty scores
    let recommendation = ''
    let next_steps: string[] = []

    if (risk_level === 'high_risk') {
      // High risk takes priority - we found matching products/patents
      const partialNote = anyAgentFailed ? ' (Note: Some searches failed - more matches may exist)' : ''
      recommendation = `Very similar products or patents found. Your invention may already exist in some form.${partialNote}`
      next_steps = [
        'Review the high-conflict findings below carefully',
        'Identify what makes your approach different',
        'Consider design-around strategies or pivoting',
        'Consult with a patent attorney before investing further',
      ]
    } else if (risk_level === 'incomplete') {
      recommendation = 'Search incomplete due to API issues. Results may not be reliable. Please try again or consult a professional.'
      next_steps = [
        'Try running the novelty check again',
        'Consult a patent attorney for a professional prior art search',
        'Review partial results below for initial insights',
      ]
    } else if (risk_level === 'moderate_risk') {
      recommendation = 'Adjacent products found. Your differentiators may be meaningful, but competition exists.'
      next_steps = [
        'Analyze similar products to find differentiation angles',
        'Refine your unique value proposition',
        'Consider design-around strategies for existing patents',
        'Consult with patent attorney about patentability',
      ]
    } else {
      recommendation = 'No obvious matches found. Consider a professional search before significant investment.'
      next_steps = [
        'Consider filing a provisional patent application',
        'Conduct professional prior art search with patent attorney',
        'Start prototyping and testing with target users',
        'Validate market demand through MVP',
      ]
    }

    const response: NoveltyCheckResponse = {
      overall_novelty_score,
      risk_level,
      web_search_result: webResult,
      retail_search_result: retailResult,
      patent_search_result: patentResult,
      recommendation,
      next_steps,
      truth_scores: avgTruthScores,
    }

    // Optionally save results to database if projectId provided
    if (projectId) {
      const memoryData: AiMemoryInsert = {
        user_id: user.id,
        project_id: projectId,
        memory_type: 'insight',
        content: {
          type: 'novelty_check',
          results: response as unknown as Json,
          timestamp: new Date().toISOString(),
        } as Json,
        importance_score: overall_novelty_score,
      }
      await supabase.from('ai_memory').insert(memoryData as never)
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Novelty Check API error:', error)
    return NextResponse.json(
      { error: 'Failed to perform novelty check' },
      { status: 500 }
    )
  }
}
