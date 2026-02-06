// Unified AI Client with Anthropic → OpenAI fallback
// Automatically falls back to OpenAI when Anthropic fails (rate limit, no credits, etc.)

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

// Model mappings: Anthropic → OpenAI equivalent
const MODEL_MAPPING: Record<string, string> = {
  'claude-3-haiku-20240307': 'gpt-4o-mini',
  'claude-3-sonnet-20240229': 'gpt-4o',
  'claude-3-opus-20240229': 'gpt-4o',
  'claude-3-5-sonnet-20241022': 'gpt-4o',
}

// Initialize clients lazily
let anthropicClient: Anthropic | null = null
let openaiClient: OpenAI | null = null

function getAnthropicClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return anthropicClient
}

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiClient
}

interface CompletionOptions {
  model?: string
  maxTokens?: number
  temperature?: number
}

interface CompletionResult {
  text: string
  provider: 'anthropic' | 'openai'
  model: string
}

/**
 * Error types that should trigger fallback to OpenAI
 */
function shouldFallback(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    // Credit/billing errors
    if (message.includes('credit') || message.includes('billing') || message.includes('balance')) {
      return true
    }
    // Rate limit errors
    if (message.includes('rate limit') || message.includes('429')) {
      return true
    }
    // Overloaded/unavailable
    if (message.includes('overloaded') || message.includes('503') || message.includes('529')) {
      return true
    }
    // Invalid request (400) - often means model not available
    if (message.includes('invalid_request') && message.includes('400')) {
      return true
    }
  }
  return false
}

/**
 * Create a completion using Anthropic with automatic OpenAI fallback
 *
 * @param prompt - The user prompt
 * @param systemPrompt - Optional system prompt
 * @param options - Model and generation options
 * @returns Completion result with provider info
 */
export async function createCompletion(
  prompt: string,
  systemPrompt?: string,
  options: CompletionOptions = {}
): Promise<CompletionResult> {
  const {
    model = 'claude-3-haiku-20240307',
    maxTokens = 2048,
    temperature = 0,
  } = options

  // Try Anthropic first
  const anthropic = getAnthropicClient()
  if (anthropic) {
    try {
      console.log(`[AI Client] Trying Anthropic (${model})...`)

      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      })

      const content = response.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Anthropic')
      }

      console.log(`[AI Client] Anthropic success`)
      return {
        text: content.text,
        provider: 'anthropic',
        model,
      }
    } catch (error) {
      console.error(`[AI Client] Anthropic error:`, error)

      if (!shouldFallback(error)) {
        // Re-throw non-fallback errors
        throw error
      }

      console.log(`[AI Client] Falling back to OpenAI...`)
    }
  }

  // Fallback to OpenAI
  const openai = getOpenAIClient()
  if (!openai) {
    throw new Error(
      'Both Anthropic and OpenAI are unavailable. ' +
      'Check API keys: ANTHROPIC_API_KEY and OPENAI_API_KEY'
    )
  }

  const openaiModel = MODEL_MAPPING[model] || 'gpt-4o-mini'
  console.log(`[AI Client] Using OpenAI (${openaiModel})...`)

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }
  messages.push({ role: 'user', content: prompt })

  const response = await openai.chat.completions.create({
    model: openaiModel,
    max_tokens: maxTokens,
    temperature,
    messages,
  })

  const text = response.choices[0]?.message?.content
  if (!text) {
    throw new Error('No response from OpenAI')
  }

  console.log(`[AI Client] OpenAI success`)
  return {
    text,
    provider: 'openai',
    model: openaiModel,
  }
}

// Message type for multi-turn conversations
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Create a chat completion with conversation history
 * Supports multi-turn conversations with automatic Anthropic → OpenAI fallback
 *
 * @param messages - Array of conversation messages
 * @param systemPrompt - Optional system prompt
 * @param options - Model and generation options
 * @returns Completion result with provider info
 */
export async function createChatCompletion(
  messages: ChatMessage[],
  systemPrompt?: string,
  options: CompletionOptions = {}
): Promise<CompletionResult> {
  const {
    model = 'claude-3-haiku-20240307',
    maxTokens = 2048,
    temperature = 0,
  } = options

  // Try Anthropic first
  const anthropic = getAnthropicClient()
  if (anthropic) {
    try {
      console.log(`[AI Client] Trying Anthropic chat (${model})...`)

      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      })

      const content = response.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Anthropic')
      }

      console.log(`[AI Client] Anthropic chat success`)
      return {
        text: content.text,
        provider: 'anthropic',
        model,
      }
    } catch (error) {
      console.error(`[AI Client] Anthropic chat error:`, error)

      if (!shouldFallback(error)) {
        throw error
      }

      console.log(`[AI Client] Falling back to OpenAI for chat...`)
    }
  }

  // Fallback to OpenAI
  const openai = getOpenAIClient()
  if (!openai) {
    throw new Error(
      'Both Anthropic and OpenAI are unavailable. ' +
      'Check API keys: ANTHROPIC_API_KEY and OPENAI_API_KEY'
    )
  }

  const openaiModel = MODEL_MAPPING[model] || 'gpt-4o-mini'
  console.log(`[AI Client] Using OpenAI chat (${openaiModel})...`)

  const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = []

  if (systemPrompt) {
    openaiMessages.push({ role: 'system', content: systemPrompt })
  }

  for (const msg of messages) {
    openaiMessages.push({
      role: msg.role,
      content: msg.content,
    })
  }

  const response = await openai.chat.completions.create({
    model: openaiModel,
    max_tokens: maxTokens,
    temperature,
    messages: openaiMessages,
  })

  const text = response.choices[0]?.message?.content
  if (!text) {
    throw new Error('No response from OpenAI')
  }

  console.log(`[AI Client] OpenAI chat success`)
  return {
    text,
    provider: 'openai',
    model: openaiModel,
  }
}

/**
 * Check which AI providers are available
 */
export function getAvailableProviders(): string[] {
  const providers: string[] = []
  if (process.env.ANTHROPIC_API_KEY) providers.push('anthropic')
  if (process.env.OPENAI_API_KEY) providers.push('openai')
  return providers
}

/**
 * Get the primary provider (Anthropic) or fallback status
 */
export function getProviderStatus(): {
  primary: boolean
  fallback: boolean
  message: string
} {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY
  const hasOpenAI = !!process.env.OPENAI_API_KEY

  if (hasAnthropic && hasOpenAI) {
    return {
      primary: true,
      fallback: true,
      message: 'Anthropic (primary) with OpenAI fallback',
    }
  }

  if (hasAnthropic) {
    return {
      primary: true,
      fallback: false,
      message: 'Anthropic only (no fallback)',
    }
  }

  if (hasOpenAI) {
    return {
      primary: false,
      fallback: true,
      message: 'OpenAI only (Anthropic unavailable)',
    }
  }

  return {
    primary: false,
    fallback: false,
    message: 'No AI providers configured',
  }
}
