'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Lightbulb, Users, Target } from 'lucide-react'
import Link from 'next/link'
import type { Project, ProjectInsert } from '@/types/database'
import type { PostgrestError } from '@supabase/supabase-js'

export default function NewProjectPage() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [problemStatement, setProblemStatement] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setError('You must be logged in to create a project')
      setLoading(false)
      return
    }

    const projectData: ProjectInsert = {
      user_id: user.id,
      name,
      description,
      problem_statement: problemStatement,
      target_audience: targetAudience,
      status: 'draft',
      current_stage: 'market_research',
    }

    const { data, error: insertError } = await supabase
      .from('projects')
      .insert(projectData as never)
      .select()
      .single() as { data: Project | null; error: PostgrestError | null }

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
    } else if (data) {
      router.push(`/projects/${data.id}`)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="New Project" />

      <div className="flex-1 p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Back link */}
          <Link
            href="/projects"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Projects
          </Link>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                Create New Invention Project
              </CardTitle>
              <CardDescription>
                Tell us about your invention idea. The more detail you provide,
                the better our AI can help with market research.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Project Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">Project Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Smart Kitchen Timer"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Give your invention a memorable name
                  </p>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Brief Description</Label>
                  <Textarea
                    id="description"
                    placeholder="e.g., A voice-controlled kitchen timer that syncs with recipe apps..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    A short summary of what your invention does
                  </p>
                </div>

                {/* Problem Statement */}
                <div className="space-y-2">
                  <Label htmlFor="problem" className="flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Problem It Solves *
                  </Label>
                  <Textarea
                    id="problem"
                    placeholder="e.g., Home cooks often forget about multiple dishes cooking at once, leading to burnt food and frustration..."
                    value={problemStatement}
                    onChange={(e) => setProblemStatement(e.target.value)}
                    rows={4}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    What pain point does your invention address? Be specific.
                  </p>
                </div>

                {/* Target Audience */}
                <div className="space-y-2">
                  <Label htmlFor="audience" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Target Audience *
                  </Label>
                  <Textarea
                    id="audience"
                    placeholder="e.g., Home cooks aged 25-55 who frequently cook multiple dishes simultaneously and own smart home devices..."
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    rows={3}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Who would use your invention? Describe their demographics and behaviors.
                  </p>
                </div>

                {error && (
                  <div className="text-sm text-red-500 bg-red-50 p-3 rounded-md">
                    {error}
                  </div>
                )}

                <div className="flex gap-4">
                  <Button type="submit" disabled={loading} className="flex-1">
                    {loading ? 'Creating...' : 'Create Project'}
                  </Button>
                  <Link href="/projects">
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Tips */}
          <Card className="bg-slate-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Tips for Better Research</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong>Be specific about the problem:</strong> Instead of &quot;saves time,&quot;
                describe the exact frustration your invention solves.
              </p>
              <p>
                <strong>Define your audience clearly:</strong> &quot;Everyone&quot; isn&apos;t a
                target market. Narrow it down to who would buy first.
              </p>
              <p>
                <strong>Think about use cases:</strong> When and where would someone
                use your invention?
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
