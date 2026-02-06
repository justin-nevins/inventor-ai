# Novelty Assessment Fix - Implementation Plan

**Created:** 2026-02-04
**Status:** COMPLETE (2026-02-04)
**Context:** Fix misleading novelty scores and add structured intake

## Problem Summary

The Novelty Assessment shows "70% Novel" and claims "No strong prior art found" even when:
1. Patent API failed (USPTO 500 errors)
2. Web Search found 100% match products (Swat-N-Scoop)

## Tasks Checklist

### Phase 1: Core Bug Fixes

- [x] **Task 1: Update types.ts** - Add `risk_level` type
  - File: `src/lib/ai/types.ts`
  - Added: `RiskLevel` type and `risk_level` to `NoveltyCheckResponse`

- [x] **Task 2: Fix route.ts** - Score calculation + risk level
  - File: `src/app/api/novelty-check/route.ts`
  - Detects failed agents via `truth_scores.completeness === 0`
  - Uses 0.5 for failed agents instead of calculating from empty findings
  - Added risk level determination logic
  - Fixed recommendation text based on risk level

- [x] **Task 3: Update patent-results.tsx** - Add searchFailed prop
  - File: `src/components/novelty/patent-results.tsx`
  - Added `searchFailed?: boolean` prop
  - Shows amber warning when failed, green checkmark when success + no results

- [x] **Task 4: Update novelty-check-client.tsx** - Display risk badge
  - File: `src/app/(app)/projects/[projectId]/novelty/novelty-check-client.tsx`
  - Passes `searchFailed` prop to PatentResults
  - Replaced "X% Novel" badge with risk level badge
  - Added `getRiskBadge()` and `getAssessmentIcon()` helpers

### Phase 2: Intake Enhancement

- [x] **Task 5: Update new project form** - Add mechanism + key_features
  - File: `src/app/(app)/projects/new/page.tsx`
  - Added "How It Works" (mechanism) textarea
  - Added "Key Differentiators" input (comma-separated)
  - Combined into description field for storage

- [ ] **Task 6: Database migration** (Skipped for MVP)
  - Not needed - mechanism and differentiators combined into description field
  - Can add proper columns later if needed

## Code Snippets

### types.ts - Add risk_level

```typescript
export type RiskLevel = 'high_risk' | 'moderate_risk' | 'low_risk' | 'incomplete'

export interface NoveltyCheckResponse {
  overall_novelty_score: number
  risk_level: RiskLevel  // NEW
  web_search_result: NoveltyResult
  retail_search_result: NoveltyResult
  patent_search_result: NoveltyResult
  recommendation: string
  next_steps: string[]
  truth_scores: GraduatedTruthScores
}
```

### route.ts - Risk level logic

```typescript
// Detect failed agents
const webFailed = webResult.truth_scores.completeness === 0
const retailFailed = retailResult.truth_scores.completeness === 0
const patentFailed = patentResult.truth_scores.completeness === 0
const anyAgentFailed = webFailed || retailFailed || patentFailed

// Fix score calculation - use 0.5 for failed agents
const webScore = webFailed ? 0.5 :
  (webResult.is_novel ? 1 : (1 - Math.max(...webResult.findings.map(f => f.similarity_score), 0)))
const retailScore = retailFailed ? 0.5 :
  (retailResult.is_novel ? 1 : (1 - Math.max(...retailResult.findings.map(f => f.similarity_score), 0)))
const patentScore = patentFailed ? 0.5 :
  (patentResult.is_novel ? 1 : (1 - Math.max(...patentResult.findings.map(f => f.similarity_score), 0)))

// Determine risk level
const allFindings = [...webResult.findings, ...retailResult.findings, ...patentResult.findings]
const maxSimilarity = Math.max(...allFindings.map(f => f.similarity_score), 0)

let risk_level: RiskLevel
if (anyAgentFailed) {
  risk_level = 'incomplete'
} else if (maxSimilarity >= 0.8) {
  risk_level = 'high_risk'
} else if (maxSimilarity >= 0.5) {
  risk_level = 'moderate_risk'
} else {
  risk_level = 'low_risk'
}

// Fix recommendation based on risk level
const hasHighConflict = allFindings.some(f => f.similarity_score >= 0.8)
let recommendation: string
let next_steps: string[]

if (risk_level === 'incomplete') {
  recommendation = 'Search incomplete due to API issues. Results may not be reliable.'
  next_steps = ['Try running the search again', 'Consult a patent attorney for professional search']
} else if (risk_level === 'high_risk' || hasHighConflict) {
  recommendation = 'Very similar products or patents found. Consider differentiating your approach.'
  next_steps = ['Analyze the similar products to find gaps', 'Refine your unique value proposition', 'Consider design-around strategies']
} else if (risk_level === 'moderate_risk') {
  recommendation = 'Adjacent products found. Your differentiators may be meaningful.'
  next_steps = ['Review similar products for differentiation angles', 'Consult with patent attorney about patentability']
} else {
  recommendation = 'No obvious matches found. Consider professional search before investing.'
  next_steps = ['Consider filing a provisional patent', 'Start prototyping and testing', 'Validate market demand']
}
```

### patent-results.tsx - searchFailed prop

```typescript
interface PatentResultsProps {
  findings: PatentFinding[]
  summary: string
  isNovel: boolean
  searchFailed?: boolean  // NEW
  className?: string
}

// In render, replace empty state:
{findings.length === 0 ? (
  searchFailed ? (
    <div className="p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
      <p className="text-neutral-600">Unable to complete patent search</p>
      <p className="text-sm text-neutral-400 mt-1">
        Please try again later or consult a patent attorney
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
) : ( /* existing findings render */ )}
```

### novelty-check-client.tsx - Risk badge

```typescript
// Add helper function
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
      return <Badge className={getNoveltyColor(results.overall_novelty_score)}>
        {Math.round(results.overall_novelty_score * 100)}% Novel
      </Badge>
  }
}

// Update PatentResults call (around line 310):
<PatentResults
  findings={transformPatentFindings(results)}
  summary={results.patent_search_result.summary}
  isNovel={results.patent_search_result.is_novel}
  searchFailed={results.patent_search_result.truth_scores.completeness === 0}
/>

// Update badge display (around line 266):
{results.risk_level ? getRiskBadge(results.risk_level) : (
  <Badge className={getNoveltyColor(results.overall_novelty_score)}>
    {Math.round(results.overall_novelty_score * 100)}% Novel
  </Badge>
)}
```

## Risk Level Definitions

| Risk Level | Condition | Badge Color | User Action |
|------------|-----------|-------------|-------------|
| `high_risk` | Any finding >= 80% similarity | Red | Differentiate or pivot |
| `moderate_risk` | Findings 50-80% similarity | Amber | Review differentiators |
| `low_risk` | All findings < 50% AND no failures | Green | Proceed with caution |
| `incomplete` | Any agent failed (completeness=0) | Gray | Retry or consult professional |

## Verification Steps

1. Run novelty check on "Swatty Scoop" project
2. Confirm patent section shows amber warning when USPTO fails
3. Confirm badge shows "High Risk" when 100% matches found
4. Confirm badge shows "Incomplete" when any agent fails
5. Test with successful APIs to ensure "Low Risk" shows when nothing found

## Related Files

- Plan file: `/home/nostep/.claude/plans/federated-hugging-kernighan.md`
- Strategy docs: `/home/nostep/Documents/InventBiglyObsidian/InventorAI Search Strategy 3.md`
