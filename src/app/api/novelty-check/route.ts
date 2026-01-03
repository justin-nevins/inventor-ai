// Novelty Check API - Runs 3 agents in parallel
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { runWebSearchAgent } from '@/lib/ai/web-search-agent'
import { runRetailSearchAgent } from '@/lib/ai/retail-search-agent'
import { runPatentSearchAgent } from '@/lib/ai/patent-search-agent'
import type { NoveltyCheckRequest, NoveltyCheckResponse, GraduatedTruthScores } from '@/lib/ai/types'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { invention_name, description, problem_statement, target_audience, key_features, projectId } = body

    if (!invention_name || !description) {
      return NextResponse.json(
        { error: 'invention_name and description are required' },
        { status: 400 }
      )
    }

    const noveltyRequest: NoveltyCheckRequest = {
      invention_name,
      description,
      problem_statement,
      target_audience,
      key_features,
    }

    // Run all 3 agents in parallel for speed
    const [webResult, retailResult, patentResult] = await Promise.all([
      runWebSearchAgent(noveltyRequest),
      runRetailSearchAgent(noveltyRequest),
      runPatentSearchAgent(noveltyRequest),
    ])

    // Calculate overall novelty score (weighted average)
    // Web: 30%, Retail: 30%, Patent: 40% (patents are most important)
    const webScore = webResult.is_novel ? 1 : (1 - Math.max(...webResult.findings.map(f => f.similarity_score), 0))
    const retailScore = retailResult.is_novel ? 1 : (1 - Math.max(...retailResult.findings.map(f => f.similarity_score), 0))
    const patentScore = patentResult.is_novel ? 1 : (1 - Math.max(...patentResult.findings.map(f => f.similarity_score), 0))

    const overall_novelty_score = (webScore * 0.3) + (retailScore * 0.3) + (patentScore * 0.4)

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

    // Generate recommendation based on novelty score
    let recommendation = ''
    let next_steps: string[] = []

    if (overall_novelty_score >= 0.7) {
      recommendation = 'This invention appears highly novel! No strong prior art or existing products found.'
      next_steps = [
        'Consider filing a provisional patent application',
        'Conduct professional prior art search with patent attorney',
        'Start prototyping and testing with target users',
        'Validate market demand through MVP',
      ]
    } else if (overall_novelty_score >= 0.4) {
      recommendation = 'This invention has moderate novelty. Some similar solutions exist, but there may be opportunities for differentiation.'
      next_steps = [
        'Analyze competitive products to find differentiation angles',
        'Refine unique value proposition',
        'Consider design-around strategies for existing patents',
        'Consult with patent attorney about patentability',
      ]
    } else {
      recommendation = 'Similar products and/or patents already exist. Consider pivoting or finding a unique angle.'
      next_steps = [
        'Review competitive products to identify gaps',
        'Consider alternative approaches to the same problem',
        'Look for underserved niches or use cases',
        'Evaluate whether to pursue or pivot to a different idea',
      ]
    }

    const response: NoveltyCheckResponse = {
      overall_novelty_score,
      web_search_result: webResult,
      retail_search_result: retailResult,
      patent_search_result: patentResult,
      recommendation,
      next_steps,
      truth_scores: avgTruthScores,
    }

    // Optionally save results to database if projectId provided
    if (projectId) {
      await supabase.from('ai_memory').insert({
        user_id: user.id,
        project_id: projectId,
        memory_type: 'insight',
        content: {
          type: 'novelty_check',
          results: response,
          timestamp: new Date().toISOString(),
        },
        importance_score: overall_novelty_score,
      })
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
