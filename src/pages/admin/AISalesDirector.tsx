import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  syncFathomCalls,
  getSalesPerformanceStats,
  getTopRecommendations,
  getRecentSalesCalls,
  analyzeSalesCall,
  hideSalesCall,
  unhideSalesCall,
  deleteSalesCall,
  classifySalesCall,
  getUnclassifiedCallsCount,
  getUnclassifiedCalls,
  getSalesAnalytics,
  CallType
} from '@/services/salesCalls'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Eye, EyeOff, Trash2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const AISalesDirector = () => {
  const [syncing, setSyncing] = useState(false)
  const [daysBack, setDaysBack] = useState(30)
  const [currentPage, setCurrentPage] = useState(1)
  const [showHidden, setShowHidden] = useState(false)
  const [callTypeFilter, setCallTypeFilter] = useState<CallType | 'all'>('all')
  const [analyzingCalls, setAnalyzingCalls] = useState<Record<string, boolean>>({})
  const [classifyingCalls, setClassifyingCalls] = useState<Record<string, boolean>>({})
  const [bulkClassifying, setBulkClassifying] = useState(false)
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null)
  const [lastSynced, setLastSynced] = useState<Date | null>(null)
  const [selectedRecommendation, setSelectedRecommendation] = useState<any>(null)
  const [recommendationModalOpen, setRecommendationModalOpen] = useState(false)
  const [analyticsPeriod, setAnalyticsPeriod] = useState<number>(0) // 0 = all time

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

  // Fetch recent calls with pagination
  const { data: callsData, isLoading: callsLoading, refetch: refetchCalls } = useQuery({
    queryKey: ['recent-sales-calls', currentPage, showHidden, callTypeFilter],
    queryFn: () => getRecentSalesCalls(currentPage, 5, showHidden, callTypeFilter),
  })

  const recentCalls = callsData?.calls || []
  const totalPages = callsData?.totalPages || 0
  const totalCount = callsData?.totalCount || 0

  // Fetch unclassified count
  const { data: unclassifiedCount } = useQuery({
    queryKey: ['unclassified-count'],
    queryFn: getUnclassifiedCallsCount,
    refetchInterval: 10000, // Refetch every 10 seconds
  })

  // Fetch analytics data
  const { data: analytics, isLoading: analyticsLoading, refetch: refetchAnalytics } = useQuery({
    queryKey: ['sales-analytics', analyticsPeriod],
    queryFn: () => getSalesAnalytics(analyticsPeriod),
  })

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [showHidden, callTypeFilter])

  const handleSyncCalls = async () => {
    try {
      setSyncing(true)
      toast.info(`Syncing Fathom calls from last ${daysBack} days...`)

      const result = await syncFathomCalls(daysBack)

      const { new_calls, total_meetings } = result.data

      if (new_calls > 0) {
        toast.success(
          `Synced ${new_calls} new call${new_calls > 1 ? 's' : ''}! Click "Analyze with AI" to analyze them.`,
          { duration: 5000 }
        )
      } else {
        toast.info(`No new calls found. Checked ${total_meetings} meeting${total_meetings !== 1 ? 's' : ''}.`)
      }

      // Refetch calls
      refetchCalls()

      // Set last synced time
      setLastSynced(new Date())
    } catch (error: any) {
      console.error('Error syncing calls:', error)
      toast.error('Failed to sync calls: ' + error.message)
    } finally {
      setSyncing(false)
    }
  }

  const handleAnalyzeCall = async (callId: string, recordingId: number, title: string) => {
    try {
      setAnalyzingCalls(prev => ({ ...prev, [callId]: true }))
      toast.info(`Analyzing "${title}"...`)

      await analyzeSalesCall(callId, recordingId)

      toast.success('Analysis complete!', { duration: 3000 })

      // Refetch all data to show updated analysis
      refetchStats()
      refetchRecommendations()
      refetchCalls()
      refetchAnalytics()
    } catch (error: any) {
      console.error('Error analyzing call:', error)
      toast.error('Failed to analyze: ' + error.message)
    } finally {
      setAnalyzingCalls(prev => ({ ...prev, [callId]: false }))
    }
  }

  const handleHideCall = async (callId: string, title: string, isHidden: boolean) => {
    try {
      if (isHidden) {
        await unhideSalesCall(callId)
        toast.success(`Unhid "${title}"`)
      } else {
        await hideSalesCall(callId)
        toast.success(`Hid "${title}"`)
      }
      refetchCalls()
    } catch (error: any) {
      console.error('Error hiding/unhiding call:', error)
      toast.error('Failed to update: ' + error.message)
    }
  }

  const handleDeleteCall = async (callId: string, title: string) => {
    if (!confirm(`Are you sure you want to permanently delete "${title}"?`)) {
      return
    }

    try {
      await deleteSalesCall(callId)
      toast.success(`Deleted "${title}"`)
      refetchCalls()
      refetchStats()
      refetchRecommendations()
    } catch (error: any) {
      console.error('Error deleting call:', error)
      toast.error('Failed to delete: ' + error.message)
    }
  }

  const handleClassifyCall = async (callId: string, title: string) => {
    try {
      setClassifyingCalls(prev => ({ ...prev, [callId]: true }))
      toast.info(`Classifying "${title}"...`)

      const result = await classifySalesCall(callId)

      const callType = result.data.call_type
      const typeLabel = callType === 'sales' ? 'Sales Call' : 'Non-Sales Call'

      toast.success(`Classified as: ${typeLabel}`, { duration: 3000 })
      refetchCalls()
    } catch (error: any) {
      console.error('Error classifying call:', error)
      toast.error('Failed to classify: ' + error.message)
    } finally {
      setClassifyingCalls(prev => ({ ...prev, [callId]: false }))
    }
  }

  const handleBulkClassify = async () => {
    try {
      setBulkClassifying(true)
      const unclassifiedCalls = await getUnclassifiedCalls(50)

      if (unclassifiedCalls.length === 0) {
        toast.info('No unclassified calls found')
        return
      }

      toast.info(`Classifying ${unclassifiedCalls.length} calls...`, { duration: 5000 })

      let classified = 0
      for (const call of unclassifiedCalls) {
        try {
          await classifySalesCall(call.id)
          classified++
        } catch (error) {
          console.error(`Failed to classify call ${call.id}:`, error)
        }
      }

      toast.success(`Classified ${classified}/${unclassifiedCalls.length} calls!`, { duration: 5000 })
      refetchCalls()
    } catch (error: any) {
      console.error('Error bulk classifying:', error)
      toast.error('Failed to classify calls: ' + error.message)
    } finally {
      setBulkClassifying(false)
    }
  }

  const hasData = stats && stats.total_calls > 0

  // Find the selected call from the list
  const selectedCall = selectedCallId
    ? recentCalls?.find(call => call.id === selectedCallId)
    : null

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-4">
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
          </div>

          {/* Sync Controls */}
          <div className="flex items-center justify-between border-t pt-4 flex-wrap gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              {lastSynced && (
                <div className="text-xs text-muted-foreground">
                  Last synced: {lastSynced.toLocaleTimeString()}
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Sync period:</span>
                <Select value={daysBack.toString()} onValueChange={(val) => setDaysBack(Number(val))}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="60">Last 60 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                    <SelectItem value="120">Last 120 days</SelectItem>
                    <SelectItem value="180">Last 6 months</SelectItem>
                    <SelectItem value="270">Last 9 months</SelectItem>
                    <SelectItem value="365">Last 1 year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {unclassifiedCount !== undefined && unclassifiedCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex items-center gap-2"
                  onClick={handleBulkClassify}
                  disabled={bulkClassifying}
                >
                  {bulkClassifying ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Classifying...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3" />
                      Classify {unclassifiedCount} Unclassified
                    </>
                  )}
                </Button>
              )}
            </div>

            <Button
              size="default"
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

        {/* Personal Sales Analytics Section */}
        {analytics && analytics.totalAnalyzedCalls > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Personal Sales Analytics
                  </CardTitle>
                  <CardDescription>
                    Detailed insights from {analytics.totalAnalyzedCalls} analyzed calls
                  </CardDescription>
                </div>
                <Select value={analyticsPeriod.toString()} onValueChange={(val) => setAnalyticsPeriod(Number(val))}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">All Time</SelectItem>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                    <SelectItem value="180">Last 6 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full">
                {/* Performance Trend Over Time */}
                <AccordionItem value="trend">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      <span>Performance Trend Over Time</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pt-4">
                      {analyticsLoading ? (
                        <Skeleton className="h-64 w-full" />
                      ) : (
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={analytics.timeSeriesData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" style={{ fontSize: '12px' }} />
                            <YAxis domain={[0, 10]} style={{ fontSize: '12px' }} />
                            <Tooltip />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="overall"
                              stroke="#8b5cf6"
                              strokeWidth={2}
                              name="Overall Score"
                            />
                            <Line
                              type="monotone"
                              dataKey="discovery"
                              stroke="#3b82f6"
                              strokeWidth={2}
                              name="Discovery"
                            />
                            <Line
                              type="monotone"
                              dataKey="closing"
                              stroke="#10b981"
                              strokeWidth={2}
                              name="Closing"
                            />
                            <Line
                              type="monotone"
                              dataKey="engagement"
                              stroke="#f59e0b"
                              strokeWidth={2}
                              name="Engagement"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Framework Breakdown */}
                <AccordionItem value="framework">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      <span>Corey Jackson Framework Breakdown</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pt-4">
                      {analyticsLoading ? (
                        <Skeleton className="h-96 w-full" />
                      ) : (
                        <ResponsiveContainer width="100%" height={400}>
                          <BarChart data={analytics.frameworkBreakdown} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" domain={[0, 10]} style={{ fontSize: '12px' }} />
                            <YAxis dataKey="stage" type="category" width={120} style={{ fontSize: '11px' }} />
                            <Tooltip />
                            <Bar dataKey="score" fill="#8b5cf6" />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Sales Profile */}
                <AccordionItem value="profile">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      <span>Your Sales Profile (Strengths & Improvements)</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pt-4 space-y-6">
                      {/* Skill Progression */}
                      <div>
                        <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-green-600" />
                          Recent Progress
                        </h4>
                        <div className="space-y-2">
                          {analytics.skillProgression.overall !== 0 && (
                            <div className="flex items-center justify-between text-sm">
                              <span>Overall</span>
                              <span className={analytics.skillProgression.overall > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                                {analytics.skillProgression.overall > 0 ? '+' : ''}{analytics.skillProgression.overall}
                              </span>
                            </div>
                          )}
                          {analytics.skillProgression.discovery !== 0 && (
                            <div className="flex items-center justify-between text-sm">
                              <span>Discovery</span>
                              <span className={analytics.skillProgression.discovery > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                                {analytics.skillProgression.discovery > 0 ? '+' : ''}{analytics.skillProgression.discovery}
                              </span>
                            </div>
                          )}
                          {analytics.skillProgression.closing !== 0 && (
                            <div className="flex items-center justify-between text-sm">
                              <span>Closing</span>
                              <span className={analytics.skillProgression.closing > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                                {analytics.skillProgression.closing > 0 ? '+' : ''}{analytics.skillProgression.closing}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Top Improvement Areas */}
                      <div>
                        <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-orange-600" />
                          Focus on These Areas
                        </h4>
                        <div className="space-y-2">
                          {analytics.improvementAreas.map((area: any, i: number) => (
                            <div key={i} className="flex items-center justify-between p-2 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 rounded-lg">
                              <span className="text-xs font-medium">{area.stage}</span>
                              <Badge variant="outline" className="bg-white dark:bg-gray-900">
                                {area.score}/10
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Top Strengths */}
                      <div>
                        <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Your Strengths
                        </h4>
                        <div className="space-y-2">
                          {analytics.topStrengths.map((strength: any, i: number) => (
                            <div key={i} className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg">
                              <span className="text-xs font-medium">{strength.stage}</span>
                              <Badge variant="outline" className="bg-white dark:bg-gray-900">
                                {strength.score}/10
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Call Analysis / Top Recommendations */}
          <Card>
            <CardHeader>
              {selectedCall ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Phone className="h-5 w-5 text-primary" />
                      <CardTitle>Call Analysis</CardTitle>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedCallId(null)}>
                      Back to Overview
                    </Button>
                  </div>
                  <CardDescription className="truncate">
                    {selectedCall.title || selectedCall.meeting_title || 'Untitled Call'}
                  </CardDescription>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    <CardTitle>Top Recommendations</CardTitle>
                  </div>
                  <CardDescription>AI-powered suggestions to improve your close rate</CardDescription>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {selectedCall && selectedCall.analysis ? (
                <div className="space-y-6">
                  {/* Overall Score */}
                  <div className="text-center pb-4 border-b">
                    <div className="text-4xl font-bold text-primary mb-2">
                      {selectedCall.analysis.overall_score}/10
                    </div>
                    <p className="text-sm text-muted-foreground">Overall Score</p>
                  </div>

                  {/* Framework Adherence */}
                  {selectedCall.analysis.framework_adherence_score !== undefined && (
                    <div className="text-center pb-4 border-b">
                      <div className="text-2xl font-bold text-blue-600 mb-1">
                        {selectedCall.analysis.framework_adherence_score}/10
                      </div>
                      <p className="text-xs text-muted-foreground">Framework Adherence</p>
                    </div>
                  )}

                  {/* Corey Jackson Framework Breakdown */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm">Corey Jackson Framework</h4>
                    <div className="space-y-2">
                      {selectedCall.analysis.frame_control_score !== undefined && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs">1. Frame Control</span>
                            <span className="text-xs text-muted-foreground">{selectedCall.analysis.frame_control_score}/10</span>
                          </div>
                          <Progress value={selectedCall.analysis.frame_control_score * 10} className="h-2" />
                        </div>
                      )}
                      {selectedCall.analysis.discovery_current_state_score !== undefined && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs">2a. Current State</span>
                            <span className="text-xs text-muted-foreground">{selectedCall.analysis.discovery_current_state_score}/10</span>
                          </div>
                          <Progress value={selectedCall.analysis.discovery_current_state_score * 10} className="h-2" />
                        </div>
                      )}
                      {selectedCall.analysis.discovery_desired_state_score !== undefined && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs">2b. Desired State</span>
                            <span className="text-xs text-muted-foreground">{selectedCall.analysis.discovery_desired_state_score}/10</span>
                          </div>
                          <Progress value={selectedCall.analysis.discovery_desired_state_score * 10} className="h-2" />
                        </div>
                      )}
                      {selectedCall.analysis.discovery_cost_of_inaction_score !== undefined && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs">2c. Cost of Inaction</span>
                            <span className="text-xs text-muted-foreground">{selectedCall.analysis.discovery_cost_of_inaction_score}/10</span>
                          </div>
                          <Progress value={selectedCall.analysis.discovery_cost_of_inaction_score * 10} className="h-2" />
                        </div>
                      )}
                      {selectedCall.analysis.watt_tiedowns_score !== undefined && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs">3. WATT Tie-downs</span>
                            <span className="text-xs text-muted-foreground">{selectedCall.analysis.watt_tiedowns_score}/10</span>
                          </div>
                          <Progress value={selectedCall.analysis.watt_tiedowns_score * 10} className="h-2" />
                        </div>
                      )}
                      {selectedCall.analysis.bridge_gap_score !== undefined && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs">4. Bridge the Gap</span>
                            <span className="text-xs text-muted-foreground">{selectedCall.analysis.bridge_gap_score}/10</span>
                          </div>
                          <Progress value={selectedCall.analysis.bridge_gap_score * 10} className="h-2" />
                        </div>
                      )}
                      {selectedCall.analysis.sellback_score !== undefined && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs">5. Sellback</span>
                            <span className="text-xs text-muted-foreground">{selectedCall.analysis.sellback_score}/10</span>
                          </div>
                          <Progress value={selectedCall.analysis.sellback_score * 10} className="h-2" />
                        </div>
                      )}
                      {selectedCall.analysis.price_drop_score !== undefined && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs">6. Price Drop</span>
                            <span className="text-xs text-muted-foreground">{selectedCall.analysis.price_drop_score}/10</span>
                          </div>
                          <Progress value={selectedCall.analysis.price_drop_score * 10} className="h-2" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs">7. Objection Handling</span>
                          <span className="text-xs text-muted-foreground">{selectedCall.analysis.objection_handling_score}/10</span>
                        </div>
                        <Progress value={selectedCall.analysis.objection_handling_score * 10} className="h-2" />
                      </div>
                      {selectedCall.analysis.close_celebration_score !== undefined && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs">8. Close & Celebrate</span>
                            <span className="text-xs text-muted-foreground">{selectedCall.analysis.close_celebration_score}/10</span>
                          </div>
                          <Progress value={selectedCall.analysis.close_celebration_score * 10} className="h-2" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Recommendations */}
                  {selectedCall.analysis.recommendations && selectedCall.analysis.recommendations.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm">Recommendations</h4>
                      <div className="space-y-2">
                        {selectedCall.analysis.recommendations.map((rec: any, i: number) => {
                          const priorityStyles = {
                            high: { bg: 'bg-orange-50 dark:bg-orange-950/20', border: 'border-orange-200 dark:border-orange-900', icon: 'text-orange-600', hover: 'hover:bg-orange-100 dark:hover:bg-orange-950/30' },
                            medium: { bg: 'bg-blue-50 dark:bg-blue-950/20', border: 'border-blue-200 dark:border-blue-900', icon: 'text-blue-600', hover: 'hover:bg-blue-100 dark:hover:bg-blue-950/30' },
                            low: { bg: 'bg-green-50 dark:bg-green-950/20', border: 'border-green-200 dark:border-green-900', icon: 'text-green-600', hover: 'hover:bg-green-100 dark:hover:bg-green-950/30' },
                          }
                          const style = priorityStyles[rec.priority as keyof typeof priorityStyles] || priorityStyles.medium
                          const Icon = rec.priority === 'low' ? CheckCircle2 : AlertCircle

                          return (
                            <div
                              key={i}
                              className={`flex gap-2 p-2 border rounded-lg cursor-pointer transition-colors ${style.bg} ${style.border} ${style.hover}`}
                              onClick={() => {
                                setSelectedRecommendation(rec)
                                setRecommendationModalOpen(true)
                              }}
                            >
                              <Icon className={`h-4 w-4 ${style.icon} flex-shrink-0 mt-0.5`} />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-xs mb-1">{rec.title}</p>
                                <p className="text-xs text-muted-foreground line-clamp-2">{rec.description}</p>
                                <p className="text-xs text-primary mt-1">Click to read more →</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Strengths */}
                  {selectedCall.analysis.strengths && selectedCall.analysis.strengths.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        Strengths
                      </h4>
                      <ul className="space-y-1">
                        {selectedCall.analysis.strengths.map((strength: string, i: number) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                            <span className="text-green-600">•</span>
                            <span>{strength}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Weaknesses */}
                  {selectedCall.analysis.weaknesses && selectedCall.analysis.weaknesses.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-orange-600" />
                        Areas for Improvement
                      </h4>
                      <ul className="space-y-1">
                        {selectedCall.analysis.weaknesses.map((weakness: string, i: number) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                            <span className="text-orange-600">•</span>
                            <span>{weakness}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div className="text-center">
                      <div className="text-lg font-bold">
                        {selectedCall.analysis.talk_listen_ratio_talk}:{selectedCall.analysis.talk_listen_ratio_listen}
                      </div>
                      <p className="text-xs text-muted-foreground">Talk:Listen</p>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold">{selectedCall.analysis.questions_asked_count}</div>
                      <p className="text-xs text-muted-foreground">Questions Asked</p>
                    </div>
                  </div>
                </div>
              ) : selectedCall && !selectedCall.analysis ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm mb-2">This call hasn't been analyzed yet</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAnalyzeCall(selectedCall.id, selectedCall.recording_id, selectedCall.title || selectedCall.meeting_title || 'Untitled Call')}
                    disabled={analyzingCalls[selectedCall.id]}
                  >
                    {analyzingCalls[selectedCall.id] ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Brain className="h-3 w-3 mr-1" />
                        Analyze with AI
                      </>
                    )}
                  </Button>
                </div>
              ) : recommendationsLoading ? (
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
                  <p className="text-xs mt-1">Sync and analyze calls to get AI-powered insights</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Calls */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle>Recent Call Analysis</CardTitle>
                  <CardDescription>Your latest Fathom recordings</CardDescription>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Filter:</span>
                    <Select value={callTypeFilter} onValueChange={(val) => setCallTypeFilter(val as CallType | 'all')}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Calls</SelectItem>
                        <SelectItem value="sales">Sales Only</SelectItem>
                        <SelectItem value="non-sales">Non-Sales Only</SelectItem>
                        <SelectItem value="unclassified">Unclassified</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="show-hidden"
                      checked={showHidden}
                      onCheckedChange={(checked) => setShowHidden(checked as boolean)}
                    />
                    <label htmlFor="show-hidden" className="text-sm text-muted-foreground cursor-pointer">
                      Show hidden
                    </label>
                  </div>
                </div>
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
                <div className="space-y-4">
                  {recentCalls.map((call) => {
                    const score = call.analysis?.overall_score || 0
                    const outcome = score >= 7.5 ? 'positive' : score >= 6 ? 'neutral' : 'negative'
                    const isAnalyzing = analyzingCalls[call.id]
                    const isClassifying = classifyingCalls[call.id]
                    const callTitle = call.title || call.meeting_title || 'Untitled Call'
                    const callType = call.call_type || 'unclassified'

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
                      <div
                        key={call.id}
                        className={`p-4 border rounded-lg transition-colors ${
                          call.hidden ? 'opacity-60 bg-muted/30' : ''
                        } ${
                          selectedCallId === call.id ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'
                        } ${call.analysis ? 'cursor-pointer' : ''}`}
                        onClick={() => call.analysis && setSelectedCallId(call.id)}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm truncate">
                                {callTitle}
                              </span>
                              {call.hidden && (
                                <Badge variant="outline" className="text-xs">
                                  <EyeOff className="h-3 w-3 mr-1" />
                                  Hidden
                                </Badge>
                              )}
                              {callType === 'sales' && (
                                <Badge className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                                  Sales
                                </Badge>
                              )}
                              {callType === 'non-sales' && (
                                <Badge variant="outline" className="text-xs">
                                  Non-Sales
                                </Badge>
                              )}
                              {callType === 'unclassified' && (
                                <Badge variant="outline" className="text-xs text-muted-foreground">
                                  Unclassified
                                </Badge>
                              )}
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
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
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
                            {call.summary && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                                {call.summary}
                              </p>
                            )}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {call.hidden ? (
                                <DropdownMenuItem onClick={() => handleHideCall(call.id, callTitle, true)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  Unhide
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => handleHideCall(call.id, callTitle, false)}>
                                  <EyeOff className="h-4 w-4 mr-2" />
                                  Hide
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => handleDeleteCall(call.id, callTitle)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                          {callType === 'unclassified' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleClassifyCall(call.id, callTitle)}
                              disabled={isClassifying}
                            >
                              {isClassifying ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Classifying...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-3 w-3 mr-1" />
                                  Classify with AI
                                </>
                              )}
                            </Button>
                          )}
                          {callType === 'sales' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAnalyzeCall(call.id, call.recording_id, callTitle)}
                              disabled={isAnalyzing}
                            >
                              {isAnalyzing ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  {call.analysis ? 'Re-analyzing...' : 'Analyzing...'}
                                </>
                              ) : (
                                <>
                                  <Brain className="h-3 w-3 mr-1" />
                                  {call.analysis ? 'Re-analyze' : 'Analyze with AI'}
                                </>
                              )}
                            </Button>
                          )}
                          {call.fathom_url && (
                            <Button
                              size="sm"
                              variant="ghost"
                              asChild
                            >
                              <a href={call.fathom_url} target="_blank" rel="noopener noreferrer">
                                <ArrowUpRight className="h-3 w-3 mr-1" />
                                View in Fathom
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-6 border-t">
                      <div className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages} ({totalCount} total calls)
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>

                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum: number
                            if (totalPages <= 5) {
                              pageNum = i + 1
                            } else if (currentPage <= 3) {
                              pageNum = i + 1
                            } else if (currentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i
                            } else {
                              pageNum = currentPage - 2 + i
                            }

                            return (
                              <Button
                                key={pageNum}
                                variant={currentPage === pageNum ? "default" : "outline"}
                                size="sm"
                                className="w-9"
                                onClick={() => setCurrentPage(pageNum)}
                              >
                                {pageNum}
                              </Button>
                            )
                          })}
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
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
      </div>

      {/* Recommendation Detail Modal */}
      <Dialog open={recommendationModalOpen} onOpenChange={setRecommendationModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedRecommendation?.priority === 'high' && (
                <AlertCircle className="h-5 w-5 text-orange-600" />
              )}
              {selectedRecommendation?.priority === 'medium' && (
                <AlertCircle className="h-5 w-5 text-blue-600" />
              )}
              {selectedRecommendation?.priority === 'low' && (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              )}
              {selectedRecommendation?.title}
            </DialogTitle>
            <DialogDescription>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant={selectedRecommendation?.priority === 'high' ? 'destructive' : 'secondary'}>
                  {selectedRecommendation?.priority?.toUpperCase()} PRIORITY
                </Badge>
                {selectedRecommendation?.framework_stage && (
                  <Badge variant="outline">
                    {selectedRecommendation.framework_stage.replace(/_/g, ' ').toUpperCase()}
                  </Badge>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <h4 className="font-semibold text-sm mb-2">Recommendation</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {selectedRecommendation?.description}
              </p>
            </div>

            {selectedRecommendation?.specific_timestamp && (
              <div>
                <h4 className="font-semibold text-sm mb-2">Timestamp</h4>
                <p className="text-sm text-muted-foreground">
                  {selectedRecommendation.specific_timestamp}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}

export default AISalesDirector
