'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react'
import { FindingCard, type FindingData } from './finding-card'
import type { ConflictLevel } from './conflict-selector'
import { cn } from '@/lib/utils'

export interface PatentFinding extends FindingData {
  patentNumber: string
  filingDate: string
  status?: string
}

interface PatentResultsProps {
  findings: PatentFinding[]
  summary: string
  isNovel: boolean
  searchFailed?: boolean  // True when API failed (completeness === 0)
  className?: string
}

interface FindingState {
  conflictLevel: ConflictLevel
  notes: string
}

function getInitialConflictLevel(similarity: number): ConflictLevel {
  if (similarity >= 0.7) return 'high'
  if (similarity >= 0.4) return 'medium'
  return 'low'
}

export function PatentResults({
  findings,
  summary,
  isNovel,
  searchFailed,
  className,
}: PatentResultsProps) {
  const [findingStates, setFindingStates] = useState<Record<string, FindingState>>(() => {
    const initial: Record<string, FindingState> = {}
    findings.forEach((finding) => {
      initial[finding.id] = {
        conflictLevel: getInitialConflictLevel(finding.similarityScore),
        notes: '',
      }
    })
    return initial
  })

  const updateFindingState = (id: string, updates: Partial<FindingState>) => {
    setFindingStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...updates },
    }))
  }

  const highConflictCount = Object.values(findingStates).filter(
    (s) => s.conflictLevel === 'high'
  ).length
  const mediumConflictCount = Object.values(findingStates).filter(
    (s) => s.conflictLevel === 'medium'
  ).length

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="border-b border-neutral-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
                searchFailed ? 'bg-gray-100' : isNovel ? 'bg-green-100' : 'bg-amber-100'
              )}
            >
              <FileText
                className={cn(
                  'h-5 w-5',
                  searchFailed ? 'text-gray-600' : isNovel ? 'text-green-600' : 'text-amber-600'
                )}
              />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                Patent Analysis
                {searchFailed ? (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                ) : isNovel ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                )}
              </CardTitle>
              <CardDescription className="mt-1">{summary}</CardDescription>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {highConflictCount > 0 && (
              <Badge className="bg-red-100 text-red-700 border-0">
                {highConflictCount} High
              </Badge>
            )}
            {mediumConflictCount > 0 && (
              <Badge className="bg-amber-100 text-amber-700 border-0">
                {mediumConflictCount} Medium
              </Badge>
            )}
            <Badge variant="outline">{findings.length} patents</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {findings.length === 0 ? (
          searchFailed ? (
            <div className="p-8 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
              <p className="text-neutral-600">Unable to complete patent search</p>
              <p className="text-sm text-neutral-400 mt-1">
                Please try again later or consult a patent attorney for a professional search
              </p>
            </div>
          ) : (
            <div className="p-8 text-center">
              <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-3" />
              <p className="text-neutral-600">No similar patents found</p>
              <p className="text-sm text-neutral-400 mt-1">
                This is a good sign for novelty
              </p>
            </div>
          )
        ) : (
          <div className="divide-y divide-neutral-100">
            {findings.map((finding) => (
              <div key={finding.id} className="p-4">
                <FindingCard
                  finding={{
                    ...finding,
                    source: finding.source || 'USPTO',
                  }}
                  conflictLevel={findingStates[finding.id]?.conflictLevel || 'low'}
                  onConflictChange={(level) =>
                    updateFindingState(finding.id, { conflictLevel: level })
                  }
                  notes={findingStates[finding.id]?.notes || ''}
                  onNotesChange={(notes) =>
                    updateFindingState(finding.id, { notes })
                  }
                />
              </div>
            ))}
          </div>
        )}

        {/* Patent search tips */}
        {findings.length > 0 && (
          <div className="p-4 bg-neutral-50 border-t border-neutral-100">
            <div className="flex gap-2 text-sm text-neutral-600">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              <p>
                <span className="font-medium">Tip:</span> Click on patent links to
                review the full patent documents. Consider consulting a patent
                attorney for high-conflict findings.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
