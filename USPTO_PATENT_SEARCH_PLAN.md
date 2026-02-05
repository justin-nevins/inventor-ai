# USPTO Patent Search Improvements

**Created:** 2026-02-04
**Status:** IMPLEMENTED (2026-02-04) - Awaiting PatentsView API key
**Context:** Switch from PTAB-only to PatentsView + PTAB hybrid for comprehensive patent coverage

## Problem Summary

Current patent search uses **USPTO PTAB API only**, which covers:
- IPR/PGR/CBM trials (challenged patents)
- Ex parte appeals

This is **<5% of all US patents**. Most granted patents are never challenged.

The troubleshooting guide in Obsidian (`InventorAI Search Strategy USPTO.md`) recommends:
> "MVP recommendation for your novelty check: use **PatentsView PatentSearch API** for searching"

## Solution Overview

| Component | Current | Target |
|-----------|---------|--------|
| Primary Search | PTAB (challenged only) | PatentsView (all 12M+ patents) |
| Supplementary | None | PTAB (marks challenged patents) |
| Retry Logic | None | Exponential backoff for 5xx |
| Coverage | ~5% | ~95% |

---

## Tasks Checklist

### Phase 1: Infrastructure

- [ ] **Task 1: Create retry utility**
  - File: `src/lib/search/retry.ts` (NEW)
  - Generic exponential backoff helper
  - Returns structured result (not throws)
  - Configurable: maxAttempts, delays, retry predicate

- [ ] **Task 2: Add PatentsView client**
  - File: `src/lib/search/uspto.ts`
  - New `PatentsViewClient` class
  - Rate limit: 45 req/min (1334ms interval)
  - Text search via `_text_any` operator
  - Env var: `PATENTSVIEW_API_KEY`

### Phase 2: Integration

- [ ] **Task 3: Update patent-search-agent**
  - File: `src/lib/ai/patent-search-agent.ts`
  - PatentsView as PRIMARY source
  - PTAB as SUPPLEMENTARY (marks challenged patents)
  - Merge and deduplicate results
  - Update truth_scores based on data sources

- [ ] **Task 4: Simplify PTAB queries**
  - File: `src/lib/search/uspto.ts`
  - Reduce query complexity to avoid 500s
  - Limit to 5 keywords, simpler Lucene syntax

### Phase 3: Configuration

- [ ] **Task 5: Update environment**
  - Add `PATENTSVIEW_API_KEY` to `.env.example`
  - Document key request process

---

## Implementation Details

### Task 1: Retry Utility

```typescript
// src/lib/search/retry.ts

export interface RetryOptions {
  maxAttempts?: number       // default: 3
  initialDelayMs?: number    // default: 1000
  maxDelayMs?: number        // default: 10000
  backoffMultiplier?: number // default: 2
  retryOn?: (error: unknown) => boolean
}

export interface RetryResult<T> {
  success: boolean
  data?: T
  attempts: number
  lastError?: Error
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    if (/\b5\d{2}\b/.test(message)) return true  // 5xx errors
    if (message.includes('network') || message.includes('timeout')) return true
  }
  return false
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const { maxAttempts = 3, initialDelayMs = 1000, maxDelayMs = 10000,
          backoffMultiplier = 2, retryOn = isRetryableError } = options

  let lastError: Error | undefined
  let delay = initialDelayMs

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const data = await fn()
      return { success: true, data, attempts: attempt }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxAttempts && retryOn(error)) {
        await new Promise(r => setTimeout(r, delay))
        delay = Math.min(delay * backoffMultiplier, maxDelayMs)
      } else if (!retryOn(error)) {
        break
      }
    }
  }
  return { success: false, attempts: maxAttempts, lastError }
}
```

### Task 2: PatentsView Client

```typescript
// Add to src/lib/search/uspto.ts

const PATENTSVIEW_BASE_URL = 'https://search.patentsview.org/api/v1/patent/'

export interface PatentsViewPatent {
  patent_id: string
  patent_title: string
  patent_abstract: string
  patent_date: string
  patent_type?: string
  assignee_organization?: string
}

export class PatentsViewClient {
  private apiKey: string
  private lastRequestTime = 0
  private readonly minRequestInterval = 1334 // 45 req/min

  constructor(apiKey?: string) {
    const key = apiKey || process.env.PATENTSVIEW_API_KEY
    if (!key) throw new Error('PATENTSVIEW_API_KEY required')
    this.apiKey = key
  }

  async searchPatents(params: {
    searchTerms: string[]
    limit?: number
  }): Promise<{ patents: PatentsViewPatent[], totalCount: number, error?: string }> {
    await this.enforceRateLimit()

    const query = {
      _or: [
        { _text_any: { patent_title: params.searchTerms.join(' ') } },
        { _text_any: { patent_abstract: params.searchTerms.join(' ') } },
      ]
    }

    const response = await fetch(PATENTSVIEW_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey,
      },
      body: JSON.stringify({
        q: query,
        f: ['patent_id', 'patent_title', 'patent_abstract', 'patent_date', 'patent_type'],
        o: { size: params.limit || 25 }
      }),
    })

    // ... error handling similar to USPTOClient
  }
}

// Update PatentReference source type
export interface PatentReference {
  // ...existing fields
  source: 'USPTO_PTAB' | 'USPTO_APPEALS' | 'USPTO_PATENTSVIEW'
}
```

### Task 3: Updated Patent Search Agent Flow

```
NoveltyCheckRequest
       │
       ▼
generatePatentSearchQueries() (existing)
       │
       ├──────────────────────────────────┐
       ▼                                  ▼
PatentsView API                    USPTO PTAB API
(PRIMARY - all patents)            (SUPPLEMENTARY)
       │                                  │
       ▼                                  ▼
withRetry() wrapper                withRetry() wrapper
       │                                  │
       └──────────────┬───────────────────┘
                      ▼
            mergePatentResults()
            - Deduplicate by patent number
            - Mark challenged patents
                      │
                      ▼
            analyzePatentsWithClaude() (existing)
                      │
                      ▼
              NoveltyResult
```

**Truth Scores Update:**
```typescript
truth_scores: {
  // PatentsView success = high scores
  objective_truth: hasPatentsViewData ? 0.95 : (hasPTABData ? 0.6 : 0),
  practical_truth: hasPatentsViewData ? 0.9 : (hasPTABData ? 0.5 : 0),
  completeness: hasPatentsViewData ? 0.85 : (hasPTABData ? 0.25 : 0),
  contextual_scope: hasPatentsViewData ? 0.9 : (hasPTABData ? 0.4 : 0),
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/search/retry.ts` | NEW - retry utility |
| `src/lib/search/uspto.ts` | Add PatentsViewClient, update PatentReference type |
| `src/lib/ai/patent-search-agent.ts` | Use PatentsView primary, PTAB supplementary |
| `.env.example` | Add PATENTSVIEW_API_KEY |

---

## API Key Acquisition

**PatentsView API Key:**
- Request at: https://patentsview.org/apis/keyrequest
- Or: https://patentsview-support.atlassian.net/servicedesk/customer/portal/1/group/1/create/18
- Delivered via email
- Store as `PATENTSVIEW_API_KEY`

---

## Error Handling Matrix

| Error | Retry? | Action |
|-------|--------|--------|
| 5xx Server | Yes (3x) | Exponential backoff |
| 429 Rate Limit | Yes (3x) | Longer backoff |
| 401/403 Auth | No | Return API key error |
| 400 Bad Request | No | Simplify query, try once |
| Network Timeout | Yes (3x) | Standard backoff |

---

## Verification

1. **Get PatentsView API key** from request portal
2. **Run novelty check** on "Swatty Scoop" project
3. **Verify PatentsView results** appear (should find actual patents)
4. **Verify PTAB still works** (supplementary data)
5. **Simulate 500 error** - confirm retry with backoff
6. **Check truth_scores** reflect data source quality

---

## Dependencies

- Previous work complete: Risk level badges, searchFailed prop (IMPLEMENTATION_PLAN.md)
- New env var: `PATENTSVIEW_API_KEY` required for full functionality
- Graceful degradation: Falls back to PTAB-only if PatentsView key missing

---

## Related Files

- Claude plan file: `/home/nostep/.claude/plans/federated-hugging-kernighan.md`
- Strategy docs: `/home/nostep/Documents/InventBiglyObsidian/InventorAI Search Strategy USPTO.md`
