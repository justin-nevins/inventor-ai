import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  Target,
  Users,
  MessageSquare,
  FlaskConical,
  Sparkles,
  Search,
  ShoppingBag,
  FileSearch,
} from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Project } from '@/types/database'
import type { PostgrestError } from '@supabase/supabase-js'

interface ProjectPageProps {
  params: Promise<{ projectId: string }>
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params
  const supabase = await createClient()

  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single() as { data: Project | null; error: PostgrestError | null }

  if (error || !project) {
    notFound()
  }

  return (
    <div className="flex flex-col h-full">
      <Header title={project.name} />

      <div className="flex-1 p-6 space-y-6">
        {/* Back link */}
        <Link
          href="/projects"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Projects
        </Link>

        {/* Project header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{project.name}</h1>
              <Badge
                variant="secondary"
                className={
                  project.status === 'validated'
                    ? 'bg-green-100 text-green-700'
                    : project.status === 'researching'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-100 text-slate-700'
                }
              >
                {project.status}
              </Badge>
            </div>
            <p className="text-muted-foreground max-w-2xl">
              {project.description || 'No description provided'}
            </p>
          </div>
        </div>

        {/* Primary CTA: Novelty Check */}
        <Card className="border-2 border-slate-900 bg-gradient-to-br from-slate-50 to-slate-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-6 w-6" />
              Validate Your Invention
            </CardTitle>
            <CardDescription className="text-base">
              Search patents, retail products, and the web to see if your idea already exists
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* What we search */}
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-2 text-sm">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <Search className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">Web Search</p>
                  <p className="text-xs text-muted-foreground">Kickstarter, Indiegogo, blogs</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                  <ShoppingBag className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="font-medium">Retail Search</p>
                  <p className="text-xs text-muted-foreground">Amazon, Etsy, Alibaba</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                  <FileSearch className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium">Patent Search</p>
                  <p className="text-xs text-muted-foreground">USPTO database</p>
                </div>
              </div>
            </div>

            <Link href={`/projects/${project.id}/novelty`} className="block">
              <Button size="lg" className="w-full gap-2 text-lg py-6">
                <Sparkles className="h-5 w-5" />
                Run Novelty Check
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Project details - context for the search */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5" />
                Problem Statement
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                {project.problem_statement || 'Not defined yet'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5" />
                Target Audience
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                {project.target_audience || 'Not defined yet'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Secondary action: AI Chat */}
        <Card className="bg-slate-50">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Need help refining your idea?</p>
                  <p className="text-sm text-muted-foreground">Chat with AI to improve your description before searching</p>
                </div>
              </div>
              <Link href={`/projects/${project.id}/chat`}>
                <Button variant="outline">
                  Open AI Chat
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Project metadata */}
        <div className="text-sm text-muted-foreground flex gap-4">
          <span>Created: {new Date(project.created_at).toLocaleDateString()}</span>
          <span>Last updated: {new Date(project.updated_at).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  )
}
