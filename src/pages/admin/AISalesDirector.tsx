import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Brain,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Target,
  Upload,
  Phone,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  Calendar,
  BarChart3,
  MessageSquare,
  Loader2
} from 'lucide-react'
import {
  syncFathomCalls,
  getSalesPerformanceStats,
  getTopRecommendations,
  getRecentSalesCalls
} from '@/services/salesCalls'
import { toast } from 'sonner'

const AISalesDirector = () => {
  const [syncing, setSyncing] = useState(false)

  // Fetch performance stats
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['sales-performance-stats'],
    queryFn: getSalesPerformanceStats,
  })

  // Fetch recommendations
  const { data: recommendations, isLoading: recommendationsLoading, refetch: refetchRecommendations } = useQuery({
    queryKey: ['top-recommendations'],
    queryFn: getTopRecommendations,
  })

  // Fetch recent calls
  const { data: recentCalls, isLoading: callsLoading, refetch: refetchCalls } = useQuery({
    queryKey: ['recent-sales-calls'],
    queryFn: () => getRecentSalesCalls(4),
  })

  const handleSyncCalls = async () => {
    try {
      setSyncing(true)
      toast.info('Syncing Fathom calls...')

      const result = await syncFathomCalls()

      toast.success(`Synced ${result.data.new_calls} new calls, ${result.data.analyzed_calls} analyzed`)

      // Refetch all data
      refetchStats()
      refetchRecommendations()
      refetchCalls()
    } catch (error: any) {
      console.error('Error syncing calls:', error)
      toast.error('Failed to sync calls: ' + error.message)
    } finally {
      setSyncing(false)
    }
  }

  const hasData = stats && stats.total_calls > 0

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center flex-shrink-0">
              <Brain className="h-8 w-8 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold">AI Sales Director</h1>
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                  <Sparkles className="h-3 w-3 mr-1" />
                  AI-Powered
                </Badge>
              </div>
              <p className="text-muted-foreground">
                Analyze your Fathom sales calls and improve your performance with AI insights
              </p>
            </div>
          </div>
          <Button
            size="lg"
            className="flex items-center gap-2"
            onClick={handleSyncCalls}
            disabled={syncing}
          >
            {syncing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Sync Fathom Calls
              </>
            )}
          </Button>
        </div>

        {/* Overall Performance Score */}
        {statsLoading ? (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-purple-500/5">
            <CardHeader>
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48 mt-2" />
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-4">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : hasData ? (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-purple-500/5">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl">Overall Sales Performance</CardTitle>
                  <CardDescription>Based on analysis of {stats.total_calls} sales calls</CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-bold text-primary">{stats.overall_score}/10</div>
                  {stats.trend !== 0 && (
                    <div className={`flex items-center gap-1 text-sm ${stats.trend > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {stats.trend > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      <span>{stats.trend > 0 ? '+' : ''}{stats.trend} vs older calls</span>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Discovery</span>
                    <span className="text-sm text-muted-foreground">{stats.discovery_score}/10</span>
                  </div>
                  <Progress value={stats.discovery_score * 10} className="h-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Objection Handling</span>
                    <span className="text-sm text-muted-foreground">{stats.objection_handling_score}/10</span>
                  </div>
                  <Progress value={stats.objection_handling_score * 10} className="h-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Closing</span>
                    <span className="text-sm text-muted-foreground">{stats.closing_score}/10</span>
                  </div>
                  <Progress value={stats.closing_score * 10} className="h-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Engagement</span>
                    <span className="text-sm text-muted-foreground">{stats.engagement_score}/10</span>
                  </div>
                  <Progress value={stats.engagement_score * 10} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Stats Grid */}
        {hasData && (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Calls Analyzed</CardTitle>
                <Phone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{stats.total_calls}</div>
                    <p className="text-xs text-muted-foreground">All time</p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Call Duration</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{stats.avg_duration || 'N/A'} min</div>
                    <p className="text-xs text-muted-foreground">Average length</p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Talk-Listen Ratio</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{stats.avg_talk_listen_ratio.talk}:{stats.avg_talk_listen_ratio.listen}</div>
                    <p className="text-xs text-muted-foreground">You:Them</p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Questions Asked</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{stats.avg_questions_asked}/call</div>
                    <p className="text-xs text-muted-foreground">Avg per call</p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Top Recommendations */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                <CardTitle>Top Recommendations</CardTitle>
              </div>
              <CardDescription>AI-powered suggestions to improve your close rate</CardDescription>
            </CardHeader>
            <CardContent>
              {recommendationsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : recommendations && recommendations.length > 0 ? (
                <div className="space-y-4">
                  {recommendations.map((rec: any, i: number) => {
                    const priorityStyles = {
                      high: {
                        bg: 'bg-orange-50 dark:bg-orange-950/20',
                        border: 'border-orange-200 dark:border-orange-900',
                        icon: 'text-orange-600',
                      },
                      medium: {
                        bg: 'bg-blue-50 dark:bg-blue-950/20',
                        border: 'border-blue-200 dark:border-blue-900',
                        icon: 'text-blue-600',
                      },
                      low: {
                        bg: 'bg-green-50 dark:bg-green-950/20',
                        border: 'border-green-200 dark:border-green-900',
                        icon: 'text-green-600',
                      },
                    }
                    const style = priorityStyles[rec.priority as keyof typeof priorityStyles] || priorityStyles.medium
                    const Icon = rec.priority === 'low' ? CheckCircle2 : AlertCircle

                    return (
                      <div key={i} className={`flex gap-3 p-3 border rounded-lg ${style.bg} ${style.border}`}>
                        <Icon className={`h-5 w-5 ${style.icon} flex-shrink-0 mt-0.5`} />
                        <div className="flex-1">
                          <p className="font-medium text-sm mb-1">{rec.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {rec.description}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No recommendations yet</p>
                  <p className="text-xs mt-1">Sync calls to get AI-powered insights</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Calls */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Call Analysis</CardTitle>
                  <CardDescription>Your latest Fathom recordings</CardDescription>
                </div>
                <Button variant="ghost" size="sm">View All</Button>
              </div>
            </CardHeader>
            <CardContent>
              {callsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : recentCalls && recentCalls.length > 0 ? (
                <div className="space-y-3">
                  {recentCalls.map((call) => {
                    const score = call.analysis?.overall_score || 0
                    const outcome = score >= 7.5 ? 'positive' : score >= 6 ? 'neutral' : 'negative'

                    // Format date
                    const callDate = call.recording_start_time
                      ? new Date(call.recording_start_time)
                      : null
                    const now = new Date()
                    let dateStr = 'Unknown'

                    if (callDate) {
                      const diffMs = now.getTime() - callDate.getTime()
                      const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
                      const diffDays = Math.floor(diffHours / 24)

                      if (diffHours < 1) {
                        dateStr = 'Just now'
                      } else if (diffHours < 24) {
                        dateStr = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
                      } else if (diffDays === 1) {
                        dateStr = 'Yesterday'
                      } else if (diffDays < 7) {
                        dateStr = `${diffDays} days ago`
                      } else {
                        dateStr = callDate.toLocaleDateString()
                      }
                    }

                    return (
                      <a
                        key={call.id}
                        href={call.fathom_url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-sm truncate">
                              {call.title || call.meeting_title || 'Untitled Call'}
                            </p>
                            {call.analysis && (
                              <Badge
                                variant="secondary"
                                className={`text-xs ${
                                  outcome === 'positive' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' :
                                  outcome === 'negative' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' :
                                  'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                                }`}
                              >
                                {score}/10
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {dateStr}
                            </span>
                            {call.duration_minutes && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {call.duration_minutes} min
                              </span>
                            )}
                          </div>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </a>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No calls yet</p>
                  <p className="text-xs mt-1">Click "Sync Fathom Calls" to get started</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Upload Section */}
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Upload Fathom Sales Calls</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-md">
                Drag and drop your Fathom call recordings or connect your Fathom account for automatic syncing
              </p>
              <div className="flex gap-3">
                <Button variant="outline">Connect Fathom</Button>
                <Button>Upload Files</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

export default AISalesDirector
