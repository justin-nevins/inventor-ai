'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, ExternalLink, CheckCircle, AlertCircle, Info } from 'lucide-react'
import type { NoveltyCheckResponse } from '@/lib/ai/types'

interface NoveltyCheckButtonProps {
  projectId: string
  inventionName: string
  description: string
  problemStatement?: string
  targetAudience?: string
}

export function NoveltyCheckButton({
  projectId,
  inventionName,
  description,
  problemStatement,
  targetAudience,
}: NoveltyCheckButtonProps) {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<NoveltyCheckResponse | null>(null)

  const runNoveltyCheck = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/novelty-check', {
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

      const data = await response.json()
      if (data.error) {
        throw new Error(data.error)
      }

      setResults(data)
    } catch (error) {
      console.error('Novelty check failed:', error)
      alert('Failed to run novelty check. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const getNoveltyBadge = (score: number) => {
    if (score >= 0.7) {
      return <Badge className="bg-green-500">High Novelty ({Math.round(score * 100)}%)</Badge>
    } else if (score >= 0.4) {
      return <Badge className="bg-yellow-500">Moderate Novelty ({Math.round(score * 100)}%)</Badge>
    } else {
      return <Badge className="bg-red-500">Low Novelty ({Math.round(score * 100)}%)</Badge>
    }
  }

  return (
    <div className="space-y-4">
      <Button
        onClick={runNoveltyCheck}
        disabled={loading}
        size="lg"
        className="w-full"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Running Novelty Check (3 agents working...)
          </>
        ) : (
          <>
            <Search className="h-4 w-4 mr-2" />
            Run Novelty Check
          </>
        )}
      </Button>

      {results && (
        <div className="space-y-4">
          {/* Overall Score */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Novelty Assessment
                {getNoveltyBadge(results.overall_novelty_score)}
              </CardTitle>
              <CardDescription>{results.recommendation}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Next Steps:</h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  {results.next_steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Web Search Results */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Search className="h-4 w-4" />
                Web Search Results
                {results.web_search_result.is_novel ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                {results.web_search_result.summary}
              </CardDescription>
            </CardHeader>
            {results.web_search_result.findings.length > 0 && (
              <CardContent>
                <div className="space-y-2">
                  {results.web_search_result.findings.map((finding, i) => (
                    <div key={i} className="border-l-2 border-slate-200 pl-3 py-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{finding.title}</p>
                          <p className="text-xs text-muted-foreground">{finding.description}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {Math.round(finding.similarity_score * 100)}% match
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>

          {/* Retail Search Results */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Info className="h-4 w-4" />
                Retail Availability
                {results.retail_search_result.is_novel ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                {results.retail_search_result.summary}
              </CardDescription>
            </CardHeader>
            {results.retail_search_result.findings.length > 0 && (
              <CardContent>
                <div className="space-y-2">
                  {results.retail_search_result.findings.map((finding, i) => (
                    <div key={i} className="border-l-2 border-slate-200 pl-3 py-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{finding.title}</p>
                          <p className="text-xs text-muted-foreground">{finding.description}</p>
                          {finding.metadata?.price_range && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Price: {finding.metadata.price_range}
                            </p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {Math.round(finding.similarity_score * 100)}% match
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>

          {/* Patent Search Results */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                Patent Analysis
                {results.patent_search_result.is_novel ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                {results.patent_search_result.summary}
              </CardDescription>
            </CardHeader>
            {results.patent_search_result.findings.length > 0 && (
              <CardContent>
                <div className="space-y-2">
                  {results.patent_search_result.findings.map((finding, i) => (
                    <div key={i} className="border-l-2 border-slate-200 pl-3 py-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{finding.title}</p>
                          <p className="text-xs text-muted-foreground">{finding.description}</p>
                          {finding.metadata?.status && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Status: {finding.metadata.status}
                            </p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {Math.round(finding.similarity_score * 100)}% match
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
