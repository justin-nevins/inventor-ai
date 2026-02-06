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
import { ArrowLeft, Lightbulb, Users, Target, Wrench, Sparkles } from 'lucide-react'
import Link from 'next/link'
import type { Project, ProjectInsert } from '@/types/database'
import type { PostgrestError } from '@supabase/supabase-js'

export default function NewProjectPage() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [mechanism, setMechanism] = useState('')
  const [keyFeatures, setKeyFeatures] = useState('')
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

    // Combine description with mechanism and key features for better search
    const fullDescription = [
      description,
      mechanism ? `\n\nHow it works: ${mechanism}` : '',
      keyFeatures ? `\n\nKey differentiators: ${keyFeatures}` : '',
    ].filter(Boolean).join('')

    const projectData: ProjectInsert = {
      user_id: user.id,
      name,
      description: fullDescription,
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
                Describe Your Invention
              </CardTitle>
              <CardDescription>
                We&apos;ll search patents, retail products, and the web to check if similar products exist.
                The more detail you provide, the more accurate our search.
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

                {/* Mechanism - How it works */}
                <div className="space-y-2">
                  <Label htmlFor="mechanism" className="flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    How It Works
                  </Label>
                  <Textarea
                    id="mechanism"
                    placeholder="e.g., Uses a spring-loaded mechanism to... Attaches via suction cup... Connects via Bluetooth..."
                    value={mechanism}
                    onChange={(e) => setMechanism(e.target.value)}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Describe the mechanism or technology. This helps find similar patents.
                  </p>
                </div>

                {/* Key Differentiators */}
                <div className="space-y-2">
                  <Label htmlFor="keyFeatures" className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    What Makes It Different
                  </Label>
                  <Input
                    id="keyFeatures"
                    placeholder="e.g., No electricity needed, Works with any surface, Under $5 to manufacture"
                    value={keyFeatures}
                    onChange={(e) => setKeyFeatures(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    List 2-3 things that make your invention unique (comma-separated)
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

          {/* Tips for better search results */}
          <Card className="bg-slate-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Tips for Better Search Results</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong>Describe what it does:</strong> &quot;A device that keeps drinks cold&quot;
                searches better than &quot;innovative beverage solution.&quot;
              </p>
              <p>
                <strong>Include the mechanism:</strong> How does it work? &quot;Uses vacuum insulation&quot;
                or &quot;attaches via suction cup&quot; helps find similar patents.
              </p>
              <p>
                <strong>Be specific about the problem:</strong> &quot;Prevents coffee from getting cold
                during long meetings&quot; finds relevant competitors.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
