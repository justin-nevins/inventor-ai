'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, Download, RefreshCw, CheckCircle, AlertTriangle, AlertCircle, Sparkles, X, ChevronDown, ChevronUp, Edit2 } from 'lucide-react'
import { ProgressStepper, type Step } from '@/components/novelty/progress-stepper'
import { PatentResults, type PatentFinding } from '@/components/novelty/patent-results'
import { WebResults, type WebFinding } from '@/components/novelty/web-results'
import { RetailResults, type RetailFinding } from '@/components/novelty/retail-results'
import { SearchTips } from '@/components/novelty/search-tips'
import type { NoveltyCheckResponse, ExpandedInvention } from '@/lib/ai/types'

interface NoveltyCheckClientProps {
  projectId: string
  inventionName: string
  description: string
  problemStatement?: string
  targetAudience?: string
}

type CheckStatus = 'idle' | 'expanding' | 'expanded' | 'running' | 'completed' | 'error'

export function NoveltyCheckClient({
  projectId,
  inventionName,
  description,
  problemStatement,
  targetAudience,
}: NoveltyCheckClientProps) {
  const [status, setStatus] = useState<CheckStatus>('idle')
  const [currentStep, setCurrentStep] = useState(0)
  const [results, setResults] = useState<NoveltyCheckResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // AI Expansion state
  const [expandedData, setExpandedData] = useState<ExpandedInvention | null>(null)
  const [editedFeatures, setEditedFeatures] = useState<string[]>([])
  const [showQueries, setShowQueries] = useState(false)

  const steps: Step[] = [
    {
      id: 'describe',
      label: 'Describe Invention',
      status: status === 'idle' ? 'pending' : 'completed',
    },
    {
      id: 'expand',
      label: 'AI Analysis',
      status:
        status === 'expanding'
          ? 'in_progress'
          : status === 'expanded' || status === 'running' || status === 'completed'
          ? 'completed'
          : 'pending',
    },
    {
      id: 'market',
      label: 'Market Research',
      status:
        status === 'running' && currentStep === 2
          ? 'in_progress'
          : currentStep > 2 || status === 'completed'
          ? 'completed'
          : 'pending',
    },
    {
      id: 'patent',
      label: 'Patent Search',
      status:
        status === 'running' && currentStep === 3
          ? 'in_progress'
          : currentStep > 3 || status === 'completed'
          ? 'completed'
          : 'pending',
    },
    {
      id: 'review',
      label: 'Review Results',
      status: status === 'completed' ? 'completed' : 'pending',
    },
  ]

  // Step 1: Run AI expansion
  const runExpansion = async () => {
    setStatus('expanding')
    setError(null)
    setCurrentStep(1)

    try {
      const response = await fetch('/api/expand-invention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invention_name: inventionName,
          description,
          problem_statement: problemStatement,
          target_audience: targetAudience,
        }),
      })

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      setExpandedData(data)
      setEditedFeatures(data.key_features || [])
      setStatus('expanded')
    } catch (err) {
      console.error('AI expansion failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to expand invention')
      setStatus('error')
    }
  }

  // Step 2: Run novelty check with expanded data
  const runNoveltyCheck = async () => {
    setStatus('running')
    setError(null)
    setCurrentStep(2)

    try {
      // Simulate step progression for UX
      const stepDelay = (step: number) =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            setCurrentStep(step)
            resolve()
          }, 1500)
        })

      // Build the request with expanded data
      const requestBody: Record<string, unknown> = {
        invention_name: inventionName,
        description,
        problem_statement: problemStatement,
        target_audience: targetAudience,
        projectId,
      }

      // Include expanded data if available (use edited features)
      if (expandedData) {
        requestBody.expanded = {
          ...expandedData,
          key_features: editedFeatures,
        }
      }

      // Start the actual API call
      const fetchPromise = fetch('/api/novelty-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      // Progress through steps while waiting
      await stepDelay(3)

      const response = await fetchPromise
      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      setResults(data)
      setCurrentStep(4)
      setStatus('completed')
    } catch (err) {
      console.error('Novelty check failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to run novelty check')
      setStatus('error')
    }
  }

  // Skip AI expansion and run directly
  const skipExpansion = async () => {
    setStatus('running')
    setError(null)
    setCurrentStep(2)

    try {
      const stepDelay = (step: number) =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            setCurrentStep(step)
            resolve()
          }, 1500)
        })

      const fetchPromise = fetch('/api/novelty-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invention_name: inventionName,
          description,
          problem_statement: problemStatement,
          target_audience: targetAudience,
          projectId,
        }),
      })

      await stepDelay(3)

      const response = await fetchPromise
      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      setResults(data)
      setCurrentStep(4)
      setStatus('completed')
    } catch (err) {
      console.error('Novelty check failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to run novelty check')
      setStatus('error')
    }
  }

  const resetCheck = () => {
    setStatus('idle')
    setCurrentStep(0)
    setResults(null)
    setExpandedData(null)
    setEditedFeatures([])
    setError(null)
  }

  const removeFeature = (index: number) => {
    setEditedFeatures(prev => prev.filter((_, i) => i !== index))
  }

  // Transform API results to component format
  const transformPatentFindings = (results: NoveltyCheckResponse): PatentFinding[] => {
    return results.patent_search_result.findings.map((finding, index) => ({
      id: `patent-${index}`,
      title: finding.title,
      description: finding.description,
      url: finding.url,
      source: finding.source,
      similarityScore: finding.similarity_score,
      patentNumber: String(finding.metadata?.patent_number || `Patent ${index + 1}`),
      filingDate: String(finding.metadata?.filing_date || 'Unknown'),
      status: finding.metadata?.status as string | undefined,
      aiConflictSummary: finding.metadata?.conflict_summary as string | undefined,
    }))
  }

  const transformWebFindings = (results: NoveltyCheckResponse): WebFinding[] => {
    return results.web_search_result.findings.map((finding, index) => ({
      id: `web-${index}`,
      title: finding.title,
      description: finding.description,
      url: finding.url,
      source: finding.source,
      similarityScore: finding.similarity_score,
      imageUrl: finding.metadata?.image_url as string | undefined,
      aiConflictSummary: finding.metadata?.conflict_summary as string | undefined,
    }))
  }

  const transformRetailFindings = (results: NoveltyCheckResponse): RetailFinding[] => {
    return results.retail_search_result.findings.map((finding, index) => ({
      id: `retail-${index}`,
      title: finding.title,
      description: finding.description,
      url: finding.url,
      source: finding.source,
      similarityScore: finding.similarity_score,
      price: (finding.metadata?.price_range || finding.metadata?.price) as string | undefined,
      imageUrl: finding.metadata?.image_url as string | undefined,
      retailer: finding.metadata?.retailer as string | undefined,
      aiConflictSummary: finding.metadata?.conflict_summary as string | undefined,
    }))
  }

  // Get risk level badge with clear labels
  const getRiskBadge = (riskLevel: string) => {
    switch (riskLevel) {
      case 'high_risk':
        return <Badge className="bg-red-100 text-red-700">High Risk</Badge>
      case 'moderate_risk':
        return <Badge className="bg-amber-100 text-amber-700">Moderate Risk</Badge>
      case 'low_risk':
        return <Badge className="bg-green-100 text-green-700">Low Risk</Badge>
      case 'incomplete':
        return <Badge className="bg-gray-100 text-gray-600">Incomplete</Badge>
      default:
        return null
    }
  }

  // Get icon for assessment header based on risk level
  const getAssessmentIcon = (riskLevel: string) => {
    switch (riskLevel) {
      case 'high_risk':
        return <AlertCircle className="h-6 w-6 text-red-600" />
      case 'moderate_risk':
        return <AlertTriangle className="h-6 w-6 text-amber-600" />
      case 'low_risk':
        return <CheckCircle className="h-6 w-6 text-green-600" />
      case 'incomplete':
        return <AlertTriangle className="h-6 w-6 text-gray-500" />
      default:
        return <CheckCircle className="h-6 w-6 text-neutral-600" />
    }
  }

  const getAssessmentBgColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'high_risk':
        return 'bg-red-100'
      case 'moderate_risk':
        return 'bg-amber-100'
      case 'low_risk':
        return 'bg-green-100'
      case 'incomplete':
        return 'bg-gray-100'
      default:
        return 'bg-neutral-100'
    }
  }

  return (
    <div className="space-y-6">
      {/* Progress Stepper */}
      <Card>
        <CardContent className="py-6">
          <ProgressStepper steps={steps} />
        </CardContent>
      </Card>

      {/* Step 1: Idle - Show invention details and expand button */}
      {status === 'idle' && (
        <Card>
          <CardHeader>
            <CardTitle>Ready to Check Novelty</CardTitle>
            <CardDescription>
              We will search patents, retail products, and the web to find
              similar inventions and assess the novelty of your idea.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-neutral-50 rounded-lg space-y-2">
                <h4 className="font-medium text-sm text-neutral-700">
                  Searching for: {inventionName}
                </h4>
                <p className="text-sm text-neutral-500 line-clamp-2">
                  {description}
                </p>
              </div>
              <SearchTips inventionName={inventionName} />
              <div className="flex gap-3">
                <Button onClick={runExpansion} size="lg" className="flex-1">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Analyze with AI
                </Button>
                <Button onClick={skipExpansion} size="lg" variant="outline">
                  <Search className="h-4 w-4 mr-2" />
                  Skip to Search
                </Button>
              </div>
              <p className="text-xs text-neutral-400 text-center">
                AI analysis extracts key features and optimizes search queries for better results
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Expanding - Loading state */}
      {status === 'expanding' && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-neutral-400 mx-auto" />
              <div>
                <h3 className="font-semibold text-lg text-neutral-900">
                  Analyzing your invention...
                </h3>
                <p className="text-neutral-500 text-sm mt-1">
                  AI is extracting key features and optimizing search queries
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Expanded - Show AI analysis results */}
      {status === 'expanded' && expandedData && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  AI Analysis Complete
                </CardTitle>
                <CardDescription>
                  Review the extracted features and search queries before running the novelty check
                </CardDescription>
              </div>
              <Badge variant="outline">{expandedData.product_category}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Expanded Description */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-neutral-700 flex items-center gap-2">
                Enhanced Description
                <Edit2 className="h-3 w-3 text-neutral-400" />
              </h4>
              <p className="text-sm text-neutral-600 p-3 bg-neutral-50 rounded-lg">
                {expandedData.expanded_description}
              </p>
            </div>

            {/* Key Features */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-neutral-700">
                Key Features ({editedFeatures.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {editedFeatures.map((feature, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="py-1.5 px-3 text-sm bg-blue-50 text-blue-700 hover:bg-blue-100"
                  >
                    {feature}
                    <button
                      onClick={() => removeFeature(index)}
                      className="ml-2 hover:text-blue-900"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            {/* Differentiators */}
            {expandedData.differentiators && expandedData.differentiators.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-neutral-700">
                  What Makes This Unique
                </h4>
                <ul className="space-y-1">
                  {expandedData.differentiators.map((diff, index) => (
                    <li key={index} className="text-sm text-neutral-600 flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      {diff}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Search Queries (Collapsible) */}
            <div className="space-y-2">
              <button
                onClick={() => setShowQueries(!showQueries)}
                className="font-medium text-sm text-neutral-700 flex items-center gap-2 hover:text-neutral-900"
              >
                Optimized Search Queries
                {showQueries ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              {showQueries && (
                <div className="space-y-3 p-3 bg-neutral-50 rounded-lg text-sm">
                  <div>
                    <span className="text-neutral-500">Web:</span>{' '}
                    <span className="text-neutral-700">{expandedData.web_queries?.join(', ')}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Retail:</span>{' '}
                    <span className="text-neutral-700">{expandedData.retail_queries?.join(', ')}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Patent:</span>{' '}
                    <span className="text-neutral-700">{expandedData.patent_queries?.join(', ')}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button onClick={runNoveltyCheck} size="lg" className="flex-1">
                <Search className="h-4 w-4 mr-2" />
                Run Novelty Check
              </Button>
              <Button onClick={resetCheck} size="lg" variant="outline">
                Start Over
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Running state */}
      {status === 'running' && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-neutral-400 mx-auto" />
              <div>
                <h3 className="font-semibold text-lg text-neutral-900">
                  {currentStep === 2 && 'Searching retail and web...'}
                  {currentStep === 3 && 'Searching patent databases...'}
                </h3>
                <p className="text-neutral-500 text-sm mt-1">
                  {expandedData
                    ? 'Using AI-optimized search queries for better results.'
                    : 'Our AI agents are working in parallel.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {status === 'error' && (
        <Card className="border-red-200">
          <CardContent className="py-8">
            <div className="text-center space-y-4">
              <AlertTriangle className="h-12 w-12 text-red-400 mx-auto" />
              <div>
                <h3 className="font-semibold text-lg text-neutral-900">
                  Something went wrong
                </h3>
                <p className="text-neutral-500 text-sm mt-1">{error}</p>
              </div>
              <div className="flex gap-3 justify-center">
                <Button onClick={runExpansion} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
                <Button onClick={resetCheck} variant="ghost">
                  Start Over
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completed state - Results */}
      {status === 'completed' && results && (
        <>
          {/* Overall Score Card */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${getAssessmentBgColor(results.risk_level)}`}>
                    {getAssessmentIcon(results.risk_level)}
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-3">
                      Novelty Assessment
                      {getRiskBadge(results.risk_level)}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {results.recommendation}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={resetCheck}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Run Again
                  </Button>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-neutral-700">
                  Recommended Next Steps:
                </h4>
                <ul className="space-y-2">
                  {results.next_steps.map((step, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2 text-sm text-neutral-600"
                    >
                      <span className="h-5 w-5 rounded-full bg-neutral-100 text-neutral-500 flex items-center justify-center text-xs shrink-0">
                        {index + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Patent Results */}
          <PatentResults
            findings={transformPatentFindings(results)}
            summary={results.patent_search_result.summary}
            isNovel={results.patent_search_result.is_novel}
            searchFailed={results.patent_search_result.truth_scores.completeness === 0}
          />

          {/* Web Results */}
          <WebResults
            findings={transformWebFindings(results)}
            summary={results.web_search_result.summary}
            isNovel={results.web_search_result.is_novel}
          />

          {/* Retail Results */}
          <RetailResults
            findings={transformRetailFindings(results)}
            summary={results.retail_search_result.summary}
            isNovel={results.retail_search_result.is_novel}
          />

          {/* Truth Scores (for transparency) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assessment Confidence</CardTitle>
              <CardDescription>
                How confident we are in this novelty assessment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-neutral-50 rounded-lg">
                  <div className="text-2xl font-bold text-neutral-900">
                    {Math.round(results.truth_scores.objective_truth * 100)}%
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    Objective Truth
                  </div>
                </div>
                <div className="text-center p-3 bg-neutral-50 rounded-lg">
                  <div className="text-2xl font-bold text-neutral-900">
                    {Math.round(results.truth_scores.practical_truth * 100)}%
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    Practical Value
                  </div>
                </div>
                <div className="text-center p-3 bg-neutral-50 rounded-lg">
                  <div className="text-2xl font-bold text-neutral-900">
                    {Math.round(results.truth_scores.completeness * 100)}%
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    Completeness
                  </div>
                </div>
                <div className="text-center p-3 bg-neutral-50 rounded-lg">
                  <div className="text-2xl font-bold text-neutral-900">
                    {Math.round(results.truth_scores.contextual_scope * 100)}%
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    Context Relevance
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
