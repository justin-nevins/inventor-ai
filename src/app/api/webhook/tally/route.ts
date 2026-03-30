import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.TALLY_SIGNING_SECRET
  if (!secret) return true // skip verification if no secret configured
  if (!signature) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64')

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

// Resolve option IDs to text labels for selection fields
function resolveOptions(field: TallyField): string | string[] | null {
  if (!field.options || field.value == null) return field.value

  if (Array.isArray(field.value)) {
    return field.options
      .filter((o) => field.value.includes(o.id))
      .map((o) => o.text)
  }

  const match = field.options.find((o) => o.id === field.value)
  return match ? match.text : field.value
}

interface TallyOption {
  id: string
  text: string
}

interface TallyField {
  key: string
  label: string
  type: string
  value: any
  options?: TallyOption[]
}

interface TallyWebhookPayload {
  eventId: string
  eventType: string
  createdAt: string
  data: {
    responseId: string
    respondentId: string
    formId: string
    formName: string
    createdAt: string
    fields: TallyField[]
  }
}

function findField(fields: TallyField[], labelPattern: string): TallyField | undefined {
  return fields.find((f) =>
    f.label.toLowerCase().includes(labelPattern.toLowerCase())
  )
}

function getResolved(fields: TallyField[], labelPattern: string): any {
  const field = findField(fields, labelPattern)
  if (!field) return null
  return resolveOptions(field)
}

function getScale(fields: TallyField[], labelPattern: string): number | null {
  const field = findField(fields, labelPattern)
  return field?.value != null ? Number(field.value) : null
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('tally-signature')

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: TallyWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (payload.eventType !== 'FORM_RESPONSE') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const { data } = payload
  const fields = data.fields

  const row = {
    tally_response_id: data.responseId,
    tally_form_id: data.formId,
    respondent_id: data.respondentId,
    submitted_at: data.createdAt,

    // Contact info
    email: getResolved(fields, 'email address'),
    first_name: getResolved(fields, 'first name'),

    // Section 1: Background
    experience_level: getResolved(fields, 'experience level'),
    current_situation: getResolved(fields, 'current situation'),
    idea_timeline: getResolved(fields, 'how long have you been'),

    // Section 2: Challenges
    biggest_challenge: getResolved(fields, 'single biggest challenge'),
    time_consuming_tasks: getResolved(fields, 'most of your time'),
    resources_tried: getResolved(fields, 'already tried'),
    resources_experience: getResolved(fields, 'experience with those resources'),

    // Challenge ratings
    rating_viable_ideas: getScale(fields, 'coming up with viable ideas'),
    rating_market_potential: getScale(fields, 'market potential'),
    rating_patent_ip: getScale(fields, 'patent/ip protection'),
    rating_sell_sheet: getScale(fields, 'sell sheet'),
    rating_prototype: getScale(fields, 'prototype'),
    rating_finding_companies: getScale(fields, 'finding companies'),
    rating_getting_responses: getScale(fields, 'getting responses'),
    rating_pitching: getScale(fields, 'what to say when pitching'),
    rating_deal_terms: getScale(fields, 'deal terms'),
    rating_motivation: getScale(fields, 'staying motivated'),

    // Section 3: What would help
    dream_tool: getResolved(fields, 'magic wand'),
    value_market_evaluation: getScale(fields, 'evaluates if your idea has market'),
    value_patent_search: getScale(fields, 'patent/prior art search'),
    value_sell_sheet_creator: getScale(fields, 'sell sheet creator'),
    value_company_database: getScale(fields, 'database of companies'),
    value_contact_templates: getScale(fields, 'scripts and templates'),
    value_ai_email_assistant: getScale(fields, 'write emails and follow-ups'),
    value_community: getScale(fields, 'community of other inventors'),
    value_progress_tracking: getScale(fields, 'progress tracking'),
    value_video_courses: getScale(fields, 'video courses'),
    value_coaching: getScale(fields, '1-on-1 coaching'),
    price_too_cheap: getResolved(fields, 'so cheap you would question'),
    price_great_deal: getResolved(fields, 'feel like a great deal'),
    price_getting_expensive: getResolved(fields, 'start to feel expensive'),
    price_too_expensive: getResolved(fields, 'too expensive to consider'),

    // Section 4: Contact
    interview_willing: getResolved(fields, '15-minute interview'),
    additional_comments: getResolved(fields, 'anything else'),

    // Full payload
    raw_payload: payload,
  }

  const { error } = await supabase.from('survey_responses').upsert(row, {
    onConflict: 'tally_response_id',
  })

  if (error) {
    console.error('Failed to store survey response:', error)
    return NextResponse.json({ error: 'Storage failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, responseId: data.responseId })
}
