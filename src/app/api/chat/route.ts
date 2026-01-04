import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import type { Message, Project, Conversation, ConversationInsert, MessageInsert } from '@/types/database'

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

    // Create or get conversation
    let activeConversationId = conversationId

    if (!activeConversationId) {
      // Create a new conversation
      const conversationData: ConversationInsert = {
        user_id: user.id,
        project_id: projectId || null,
        agent_type: 'assistant',
        title: message.substring(0, 100), // Use first part of message as title
      }

      const { data: newConversation, error: convError } = await supabase
        .from('conversations')
        .insert(conversationData as never)
        .select()
        .single() as { data: Conversation | null; error: unknown }

      if (convError || !newConversation) {
        console.error('Failed to create conversation:', convError)
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
      }

      activeConversationId = newConversation.id
    }

    // Get conversation history if exists
    let messages: { role: 'user' | 'assistant'; content: string }[] = []

    const { data: historyData } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', activeConversationId)
      .order('created_at', { ascending: true })
      .limit(20) as { data: Pick<Message, 'role' | 'content'>[] | null }

    if (historyData) {
      messages = historyData.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
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
      model: 'claude-3-haiku-20240307',
      max_tokens: 2048,
      system: SYSTEM_PROMPT + projectContext,
      messages: messages,
    })

    const assistantMessage =
      response.content[0].type === 'text' ? response.content[0].text : ''

    // Save messages to database
    const messagesToInsert: MessageInsert[] = [
      {
        conversation_id: activeConversationId,
        role: 'user',
        content: message,
      },
      {
        conversation_id: activeConversationId,
        role: 'assistant',
        content: assistantMessage,
      },
    ]
    await supabase.from('messages').insert(messagesToInsert as never)

    return NextResponse.json({
      message: assistantMessage,
      conversationId: activeConversationId,
    })
  } catch (error) {
    console.error('Chat API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to process message', details: errorMessage },
      { status: 500 }
    )
  }
}
