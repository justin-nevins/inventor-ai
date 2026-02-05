// Retry utility with exponential backoff
// Generic helper for API calls that may need retries (5xx, network errors, etc.)

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

/**
 * Determines if an error is retryable (5xx, network, timeout)
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    // 5xx server errors
    if (/\b5\d{2}\b/.test(message)) return true
    // Network/timeout errors
    if (message.includes('network') || message.includes('timeout')) return true
    if (message.includes('econnreset') || message.includes('econnrefused')) return true
    if (message.includes('socket hang up')) return true
    // Rate limits (429) - retry after backoff
    if (/\b429\b/.test(message) || message.includes('rate limit')) return true
  }
  return false
}

/**
 * Determines if an error is NOT retryable (auth, bad request)
 */
export function isNonRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    // Auth errors - no point retrying
    if (/\b401\b/.test(message) || /\b403\b/.test(message)) return true
    if (message.includes('unauthorized') || message.includes('forbidden')) return true
    // Bad request - query is invalid, won't work on retry
    if (/\b400\b/.test(message) && !message.includes('rate')) return true
  }
  return false
}

/**
 * Executes a function with retry logic and exponential backoff
 * Returns a structured result instead of throwing
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    retryOn = isRetryableError
  } = options

  let lastError: Error | undefined
  let delay = initialDelayMs

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const data = await fn()
      return { success: true, data, attempts: attempt }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Don't retry non-retryable errors
      if (isNonRetryableError(error)) {
        console.warn(`[Retry] Non-retryable error on attempt ${attempt}: ${lastError.message}`)
        break
      }

      // Check if this error type should be retried
      if (attempt < maxAttempts && retryOn(error)) {
        console.log(`[Retry] Attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms: ${lastError.message}`)
        await new Promise(r => setTimeout(r, delay))
        delay = Math.min(delay * backoffMultiplier, maxDelayMs)
      } else if (!retryOn(error)) {
        // Error not matching retry predicate
        console.warn(`[Retry] Error not retryable: ${lastError.message}`)
        break
      }
    }
  }

  return { success: false, attempts: maxAttempts, lastError }
}

/**
 * Convenience wrapper that extracts HTTP status from fetch responses
 * Useful for wrapping fetch calls to get proper retry behavior
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  retryOptions?: RetryOptions
): Promise<RetryResult<Response>> {
  return withRetry(async () => {
    const response = await fetch(url, init)

    // Throw for server errors so they get retried
    if (response.status >= 500) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    // Throw for rate limits so they get retried with backoff
    if (response.status === 429) {
      throw new Error(`HTTP 429: Rate limit exceeded`)
    }

    // Return non-5xx responses (including 4xx) without retry
    // Caller should check response.ok
    return response
  }, retryOptions)
}
