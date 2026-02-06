import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const MAX_USERS = 10

export async function POST(request: Request) {
  const { email, password, fullName, redirectTo } = await request.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Check user count
  const { count, error: countError } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })

  if (countError) {
    // Fallback: count auth users directly
    const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1, page: 1 })
    if (users && users.users.length >= MAX_USERS) {
      return NextResponse.json(
        { error: 'Signups are currently closed. We have reached our early access limit.' },
        { status: 403 }
      )
    }
  } else if (count !== null && count >= MAX_USERS) {
    return NextResponse.json(
      { error: 'Signups are currently closed. We have reached our early access limit.' },
      { status: 403 }
    )
  }

  // Create user
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { full_name: fullName },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Send confirmation email by generating a signup link
  await supabase.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: { redirectTo },
  })

  return NextResponse.json({ user: data.user })
}
