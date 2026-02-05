// AI Agent Types and Interfaces

export type RiskLevel = 'high_risk' | 'moderate_risk' | 'low_risk' | 'incomplete'

export interface GraduatedTruthScores {
  objective_truth: number // 0-1: How verifiable/factual
  practical_truth: number // 0-1: How actionable/useful
  completeness: number // 0-1: How comprehensive
  contextual_scope: number // 0-1: How applicable to user's context
}

export interface NoveltyResult {
  agent_type: 'web_search' | 'retail_search' | 'patent_search'
  is_novel: boolean // True if appears to be novel/unique
  confidence: number // 0-1: Confidence in the assessment
  findings: NoveltyFinding[]
  summary: string
  truth_scores: GraduatedTruthScores
  search_query_used: string
  timestamp: Date
}

export interface NoveltyFinding {
  title: string
  description: string
  url?: string
  similarity_score: number // 0-1: How similar to user's invention
  source: string // e.g., "Google Search", "Amazon", "USPTO"
  metadata?: Record<string, unknown>
}

export interface NoveltyCheckRequest {
  invention_name: string
  description: string
  problem_statement?: string
  target_audience?: string
  key_features?: string[]
}

export interface NoveltyCheckResponse {
  overall_novelty_score: number // 0-1: 1 = highly novel, 0 = already exists (kept for backwards compat)
  risk_level: RiskLevel // Clear decision state: high_risk, moderate_risk, low_risk, incomplete
  web_search_result: NoveltyResult
  retail_search_result: NoveltyResult
  patent_search_result: NoveltyResult
  recommendation: string
  next_steps: string[]
  truth_scores: GraduatedTruthScores
}

export interface AgentPromptParts {
  role: string // Who the AI acts as
  task: string // What to accomplish
  howTo: string // Step-by-step method
  output: string // Expected format
}
