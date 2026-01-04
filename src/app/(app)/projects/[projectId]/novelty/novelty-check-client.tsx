'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, Download, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react'
import { ProgressStepper, type Step } from '@/components/novelty/progress-stepper'
import { PatentResults, type PatentFinding } from '@/components/novelty/patent-results'
import { WebResults, type WebFinding } from '@/components/novelty/web-results'
import { RetailResults, type RetailFinding } from '@/components/novelty/retail-results'
import type { NoveltyCheckResponse } from '@/lib/ai/types'

interface NoveltyCheckClientProps {
  projectId: string
  inventionName: string
  description: string
  problemStatement?: string
  targetAudience?: string
}

type CheckStatus = 'idle' | 'running' | 'completed' | 'error'

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

  const steps: Step[] = [
    {
      id: 'describe',
      label: 'Describe Invention',
      status: status === 'idle' ? 'pending' : 'completed',
    },
    {
      id: 'market',
      label: 'Market Research',
      status:
        status === 'running' && currentStep === 1
          ? 'in_progress'
          : currentStep > 1 || status === 'completed'
          ? 'completed'
          : 'pending',
    },
    {
      id: 'patent',
      label: 'Patent Search',
      status:
        status === 'running' && currentStep === 2
          ? 'in_progress'
          : currentStep > 2 || status === 'completed'
          ? 'completed'
          : 'pending',
    },
    {
      id: 'review',
      label: 'Review Results',
      status: status === 'completed' ? 'completed' : 'pending',
    },
  ]

  const runNoveltyCheck = async () => {
    setStatus('running')
    setError(null)
    setCurrentStep(1)

    try {
      // Simulate step progression for UX
      const stepDelay = (step: number) =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            setCurrentStep(step)
            resolve()
          }, 1500)
        })

      // Start the actual API call
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

      // Progress through steps while waiting
      await stepDelay(2)

      const response = await fetchPromise
      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      setResults(data)
      setCurrentStep(3)
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
    setError(null)
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

  const getNoveltyColor = (score: number) => {
    if (score >= 0.7) return 'bg-green-100 text-green-700'
    if (score >= 0.4) return 'bg-amber-100 text-amber-700'
    return 'bg-red-100 text-red-700'
  }

  return (
    <div className="space-y-6">
      {/* Progress Stepper */}
      <Card>
        <CardContent className="py-6">
          <ProgressStepper steps={steps} />
        </CardContent>
      </Card>

      {/* Action buttons / status */}
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
              <Button onClick={runNoveltyCheck} size="lg" className="w-full">
                <Search className="h-4 w-4 mr-2" />
                Start Novelty Check
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {status === 'running' && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-neutral-400 mx-auto" />
              <div>
                <h3 className="font-semibold text-lg text-neutral-900">
                  {currentStep === 1 && 'Searching retail and web...'}
                  {currentStep === 2 && 'Searching patent databases...'}
                </h3>
                <p className="text-neutral-500 text-sm mt-1">
                  This may take a minute. Our AI agents are working in parallel.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
              <Button onClick={runNoveltyCheck} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {status === 'completed' && results && (
        <>
          {/* Overall Score Card */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 rounded-lg bg-neutral-100 flex items-center justify-center">
                    <CheckCircle className="h-6 w-6 text-neutral-600" />
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-3">
                      Novelty Assessment
                      <Badge className={getNoveltyColor(results.overall_novelty_score)}>
                        {Math.round(results.overall_novelty_score * 100)}% Novel
                      </Badge>
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
