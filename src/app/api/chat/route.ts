import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import type { Message, Project } from '@/types/database'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const SYSTEM_PROMPT = `You are InventorAI, an expert AI assistant for inventors and product creators. Your role is to help inventors:

1. Validate their product ideas through market research
2. Identify target audiences and their pain points
3. Analyze market opportunities and competition
4. Guide them through the invention process from idea to launch

When helping inventors:
- Ask clarifying questions to understand their invention better
- Use the 4-part prompt formula (Role → Task → How-To → Output) when analyzing
- Provide actionable, practical advice
- Be encouraging but honest about potential challenges
- Reference real-world examples when helpful

Key areas of expertise:
- Market research and validation
- Target audience identification
- Competitive analysis
- Product positioning
- Launch strategy

Always be supportive of inventors while providing honest, practical guidance.`

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, conversationId, projectId } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Get conversation history if exists
    let messages: { role: 'user' | 'assistant'; content: string }[] = []

    if (conversationId) {
      const { data: historyData } = await supabase
        .from('messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(20) as { data: Pick<Message, 'role' | 'content'>[] | null }

      if (historyData) {
        messages = historyData.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))
      }
    }

    // Add the new message
    messages.push({ role: 'user', content: message })

    // Get project context if available
    let projectContext = ''
    if (projectId) {
      const { data: project } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single() as { data: Project | null }

      if (project) {
        projectContext = `

## Current Project Context
- **Project**: ${project.name}
- **Description**: ${project.description || 'Not provided'}
- **Problem Statement**: ${project.problem_statement || 'Not provided'}
- **Target Audience**: ${project.target_audience || 'Not provided'}
- **Status**: ${project.status}
`
      }
    }

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      system: SYSTEM_PROMPT + projectContext,
      messages: messages,
    })

    const assistantMessage =
      response.content[0].type === 'text' ? response.content[0].text : ''

    // Save messages to database if conversationId exists
    if (conversationId) {
      await supabase.from('messages').insert([
        {
          conversation_id: conversationId,
          role: 'user',
          content: message,
        },
        {
          conversation_id: conversationId,
          role: 'assistant',
          content: assistantMessage,
        },
      ] as any)
    }

    return NextResponse.json({
      message: assistantMessage,
      conversationId,
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    )
  }
}
