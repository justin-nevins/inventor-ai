// Expand Invention API - AI-powered description expansion and query optimization
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { expandInvention } from '@/lib/ai/expand-invention'
import type { NoveltyCheckRequest } from '@/lib/ai/types'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { invention_name, description, problem_statement, target_audience } = body

    if (!invention_name || !description) {
      return NextResponse.json(
        { error: 'invention_name and description are required' },
        { status: 400 }
      )
    }

    const noveltyRequest: NoveltyCheckRequest = {
      invention_name,
      description,
      problem_statement,
      target_audience,
    }

    // Run AI expansion
    const expanded = await expandInvention(noveltyRequest)

    return NextResponse.json(expanded)
  } catch (error) {
    console.error('Expand Invention API error:', error)
    return NextResponse.json(
      { error: 'Failed to expand invention' },
      { status: 500 }
    )
  }
}
