import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  ArrowLeft,
  Target,
  Users,
  Search,
  MessageSquare,
  BarChart3,
  FileText,
  Play,
  CheckCircle,
  FlaskConical,
} from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Project } from '@/types/database'
import type { PostgrestError } from '@supabase/supabase-js'

interface ProjectPageProps {
  params: Promise<{ projectId: string }>
}

const workflowSteps = [
  { id: 'idea', label: 'Define Idea', icon: Target, href: null },
  { id: 'communities', label: 'Find Communities', icon: Search, href: 'chat' },
  { id: 'posts', label: 'Collect Posts', icon: MessageSquare, href: 'chat' },
  { id: 'sentiment', label: 'Analyze Sentiment', icon: BarChart3, href: 'chat' },
  { id: 'simulation', label: 'Simulate Reactions', icon: Users, href: 'chat' },
  { id: 'insights', label: 'Generate Insights', icon: FileText, href: 'chat' },
  { id: 'novelty', label: 'Novelty Check', icon: FlaskConical, href: 'novelty' },
]

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

  // Calculate workflow progress
  const currentStepIndex = 0 // Will be dynamic based on workflow state
  const progress = ((currentStepIndex + 1) / workflowSteps.length) * 100

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
          <Link href={`/projects/${project.id}/chat`}>
            <Button size="lg" className="gap-2">
              <Play className="h-4 w-4" />
              Start Research
            </Button>
          </Link>
        </div>

        {/* Research workflow progress */}
        <Card>
          <CardHeader>
            <CardTitle>Market Research Progress</CardTitle>
            <CardDescription>
              Complete each step to validate your invention idea
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <Progress value={progress} className="flex-1" />
              <span className="text-sm font-medium">
                {currentStepIndex + 1}/{workflowSteps.length}
              </span>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {workflowSteps.map((step, index) => {
                const isComplete = index < currentStepIndex
                const isCurrent = index === currentStepIndex
                const StepIcon = step.icon
                const isClickable = step.href !== null

                const stepContent = (
                  <div
                    className={`flex flex-col items-center text-center p-3 rounded-lg transition-colors ${
                      isCurrent
                        ? 'bg-slate-900 text-white'
                        : isComplete
                        ? 'bg-green-50 text-green-700'
                        : 'bg-slate-50 text-slate-400'
                    } ${isClickable ? 'cursor-pointer hover:opacity-80' : ''}`}
                  >
                    <div
                      className={`h-10 w-10 rounded-full flex items-center justify-center mb-2 ${
                        isCurrent
                          ? 'bg-white text-slate-900'
                          : isComplete
                          ? 'bg-green-100'
                          : 'bg-slate-100'
                      }`}
                    >
                      {isComplete ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : (
                        <StepIcon className="h-5 w-5" />
                      )}
                    </div>
                    <span className="text-xs font-medium">{step.label}</span>
                  </div>
                )

                return isClickable ? (
                  <Link key={step.id} href={`/projects/${project.id}/${step.href}`}>
                    {stepContent}
                  </Link>
                ) : (
                  <div key={step.id}>{stepContent}</div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Project details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
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
            <CardHeader>
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

        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Link href={`/projects/${project.id}/chat`}>
                <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2">
                  <MessageSquare className="h-5 w-5" />
                  <span>AI Assistant</span>
                </Button>
              </Link>
              <Link href={`/projects/${project.id}/novelty`}>
                <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2">
                  <FlaskConical className="h-5 w-5" />
                  <span>Novelty Check</span>
                </Button>
              </Link>
              <Link href={`/projects/${project.id}/chat`}>
                <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2">
                  <Search className="h-5 w-5" />
                  <span>Market Research</span>
                </Button>
              </Link>
              <Link href={`/projects/${project.id}/chat`}>
                <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2">
                  <BarChart3 className="h-5 w-5" />
                  <span>View Insights</span>
                </Button>
              </Link>
              <Button variant="outline" className="w-full h-auto py-4 flex-col gap-2" disabled>
                <FileText className="h-5 w-5" />
                <span>Export Report</span>
              </Button>
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
