import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FolderKanban, Lightbulb, Plus, Search, ShoppingBag, FileSearch } from 'lucide-react'
import Link from 'next/link'
import type { Project } from '@/types/database'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get user's projects
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(5) as { data: Project[] | null }

  const projectCount = projects?.length || 0

  return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" />

      <div className="flex-1 p-6 space-y-6">
        {/* Welcome section */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-6 text-white">
          <h2 className="text-2xl font-bold mb-2">
            Welcome back, {user?.user_metadata?.full_name || 'Inventor'}!
          </h2>
          <p className="text-slate-300 mb-4">
            Check if your invention idea already exists. We search patents, retail products, and the web.
          </p>
          <Link href="/projects/new">
            <Button className="bg-yellow-500 hover:bg-yellow-600 text-black">
              <Plus className="h-4 w-4 mr-2" />
              Check New Invention
            </Button>
          </Link>
        </div>

        {/* Single stat card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Projects
            </CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projectCount}</div>
            <p className="text-xs text-muted-foreground">
              invention ideas
            </p>
          </CardContent>
        </Card>

        {/* Recent projects */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Projects</CardTitle>
                <CardDescription>
                  Your latest invention projects
                </CardDescription>
              </div>
              <Link href="/projects">
                <Button variant="outline" size="sm">
                  View All
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {projects && projects.length > 0 ? (
              <div className="space-y-4">
                {projects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="flex items-center justify-between p-4 rounded-lg border hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <h3 className="font-medium">{project.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {project.description || 'No description'}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(project.updated_at).toLocaleDateString()}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Lightbulb className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">No projects yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create your first project to start validating your invention idea.
                </p>
                <Link href="/projects/new">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Project
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* How It Works - focused on novelty check */}
        <Card>
          <CardHeader>
            <CardTitle>How Novelty Check Works</CardTitle>
            <CardDescription>
              AI-powered search across three channels
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 rounded-lg bg-blue-50">
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
                  <Search className="h-6 w-6 text-blue-600" />
                </div>
                <h4 className="font-medium mb-1">Web Search</h4>
                <p className="text-sm text-muted-foreground">
                  Kickstarter, Indiegogo, Product Hunt, blogs, and news
                </p>
              </div>
              <div className="text-center p-4 rounded-lg bg-green-50">
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <ShoppingBag className="h-6 w-6 text-green-600" />
                </div>
                <h4 className="font-medium mb-1">Retail Search</h4>
                <p className="text-sm text-muted-foreground">
                  Amazon, Etsy, Alibaba, eBay, Walmart, and more
                </p>
              </div>
              <div className="text-center p-4 rounded-lg bg-purple-50">
                <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-3">
                  <FileSearch className="h-6 w-6 text-purple-600" />
                </div>
                <h4 className="font-medium mb-1">Patent Search</h4>
                <p className="text-sm text-muted-foreground">
                  USPTO database with AI-powered query generation
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
