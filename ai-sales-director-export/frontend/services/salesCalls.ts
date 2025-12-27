import { supabase } from '@/lib/supabase'

export type CallType = 'sales' | 'non-sales' | 'unclassified'

export interface SalesCall {
  id: string
  recording_id: number
  title: string | null
  meeting_title: string | null
  fathom_url: string | null
  share_url: string | null
  scheduled_start_time: string | null
  scheduled_end_time: string | null
  recording_start_time: string | null
  recording_end_time: string | null
  duration_minutes: number | null
  transcript: any
  summary: string | null
  hidden: boolean
  call_type: CallType
  created_at: string
  updated_at: string
}

export interface SalesCallAnalysis {
  id: string
  sales_call_id: string
  overall_score: number
  framework_adherence_score?: number

  // Corey Jackson Framework scores
  frame_control_score?: number
  discovery_current_state_score?: number
  discovery_desired_state_score?: number
  discovery_cost_of_inaction_score?: number
  watt_tiedowns_score?: number
  bridge_gap_score?: number
  sellback_score?: number
  price_drop_score?: number
  close_celebration_score?: number

  // General scores (backwards compatibility)
  discovery_score: number
  objection_handling_score: number
  closing_score: number
  engagement_score: number

  talk_listen_ratio_talk: number
  talk_listen_ratio_listen: number
  questions_asked_count: number
  framework_insights?: any
  recommendations: any[]
  strengths: string[]
  weaknesses: string[]
  key_moments: any[]
  sentiment_analysis: any
  analyzed_at: string
  created_at: string
}

export interface SalesCallWithAnalysis extends SalesCall {
  analysis?: SalesCallAnalysis
}

// Sync calls from Fathom
export const syncFathomCalls = async (daysBack: number = 30) => {
  const { data, error } = await supabase.functions.invoke('sync-fathom-calls', {
    body: { daysBack },
  })

  if (error) {
    console.error('Error syncing Fathom calls:', error)
    throw error
  }

  return data
}

// Get all sales calls with their analysis
export const getSalesCallsWithAnalysis = async (): Promise<SalesCallWithAnalysis[]> => {
  const { data: calls, error: callsError } = await supabase
    .from('sales_calls')
    .select(`
      *,
      analysis:sales_call_analysis(*)
    `)
    .order('recording_start_time', { ascending: false })

  if (callsError) {
    console.error('Error fetching sales calls:', callsError)
    throw callsError
  }

  // Transform the data to flatten analysis
  return (calls || []).map(call => ({
    ...call,
    analysis: call.analysis?.[0] || undefined,
  }))
}

// Get performance stats
export const getSalesPerformanceStats = async () => {
  const { data: analyses, error } = await supabase
    .from('sales_call_analysis')
    .select(`
      *,
      sales_call:sales_calls!sales_call_id(duration_minutes)
    `)
    .order('analyzed_at', { ascending: false })

  if (error) {
    console.error('Error fetching performance stats:', error)
    throw error
  }

  if (!analyses || analyses.length === 0) {
    return {
      overall_score: 0,
      discovery_score: 0,
      objection_handling_score: 0,
      closing_score: 0,
      engagement_score: 0,
      total_calls: 0,
      avg_duration: 0,
      avg_talk_listen_ratio: { talk: 0, listen: 0 },
      avg_questions_asked: 0,
      trend: 0,
    }
  }

  const totalCalls = analyses.length
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0)

  // Calculate average duration from sales_calls
  const durations = analyses
    .map((a: any) => a.sales_call?.duration_minutes)
    .filter((d): d is number => d != null && d > 0)
  const avgDuration = durations.length > 0
    ? Math.round(sum(durations) / durations.length)
    : 0

  const overallScores = analyses.map(a => a.overall_score)
  const avgOverallScore = sum(overallScores) / totalCalls

  // Calculate trend (compare recent vs older)
  const recentCalls = analyses.slice(0, Math.ceil(totalCalls / 2))
  const olderCalls = analyses.slice(Math.ceil(totalCalls / 2))

  const avgRecent = recentCalls.length > 0
    ? sum(recentCalls.map(a => a.overall_score)) / recentCalls.length
    : avgOverallScore

  const avgOlder = olderCalls.length > 0
    ? sum(olderCalls.map(a => a.overall_score)) / olderCalls.length
    : avgOverallScore

  const trend = avgRecent - avgOlder

  return {
    overall_score: parseFloat(avgOverallScore.toFixed(1)),
    discovery_score: parseFloat((sum(analyses.map(a => a.discovery_score)) / totalCalls).toFixed(1)),
    objection_handling_score: parseFloat((sum(analyses.map(a => a.objection_handling_score)) / totalCalls).toFixed(1)),
    closing_score: parseFloat((sum(analyses.map(a => a.closing_score)) / totalCalls).toFixed(1)),
    engagement_score: parseFloat((sum(analyses.map(a => a.engagement_score)) / totalCalls).toFixed(1)),
    total_calls: totalCalls,
    avg_duration: avgDuration,
    avg_talk_listen_ratio: {
      talk: Math.round(sum(analyses.map(a => a.talk_listen_ratio_talk)) / totalCalls),
      listen: Math.round(sum(analyses.map(a => a.talk_listen_ratio_listen)) / totalCalls),
    },
    avg_questions_asked: Math.round(sum(analyses.map(a => a.questions_asked_count)) / totalCalls),
    trend: parseFloat(trend.toFixed(1)),
  }
}

// Get top recommendations across all calls
export const getTopRecommendations = async () => {
  const { data: analyses, error } = await supabase
    .from('sales_call_analysis')
    .select('recommendations')
    .order('analyzed_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Error fetching recommendations:', error)
    throw error
  }

  // Flatten and aggregate recommendations
  const allRecommendations: any[] = []

  analyses?.forEach(analysis => {
    if (analysis.recommendations && Array.isArray(analysis.recommendations)) {
      allRecommendations.push(...analysis.recommendations)
    }
  })

  // Group by priority and return top 3
  const highPriority = allRecommendations.filter(r => r.priority === 'high').slice(0, 1)
  const mediumPriority = allRecommendations.filter(r => r.priority === 'medium').slice(0, 1)
  const strengths = allRecommendations.filter(r => r.priority === 'low').slice(0, 1)

  return [...highPriority, ...mediumPriority, ...strengths].slice(0, 3)
}

// Get recent calls for list view with pagination
export const getRecentSalesCalls = async (
  page = 1,
  pageSize = 10,
  showHidden = false,
  callTypeFilter: CallType | 'all' = 'all'
) => {
  let query = supabase
    .from('sales_calls')
    .select(`
      *,
      analysis:sales_call_analysis(*)
    `, { count: 'exact' })

  // Only filter out hidden calls if showHidden is false
  if (!showHidden) {
    query = query.eq('hidden', false)
  }

  // Filter by call type if specified
  if (callTypeFilter !== 'all') {
    query = query.eq('call_type', callTypeFilter)
  }

  const offset = (page - 1) * pageSize

  const { data: calls, error: callsError, count } = await query
    .order('recording_start_time', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (callsError) {
    console.error('Error fetching sales calls:', callsError)
    throw callsError
  }

  // Transform the data to flatten analysis
  const transformedCalls = (calls || []).map(call => ({
    ...call,
    analysis: call.analysis?.[0] || undefined,
  }))

  return {
    calls: transformedCalls,
    totalCount: count || 0,
    totalPages: Math.ceil((count || 0) / pageSize),
    currentPage: page,
  }
}

// Manually trigger analysis for a specific call
export const analyzeSalesCall = async (callId: string, recordingId: number) => {
  const { data, error } = await supabase.functions.invoke('analyze-sales-call', {
    body: {
      sales_call_id: callId,
      recording_id: recordingId,
    },
  })

  if (error) {
    console.error('Error analyzing call:', error)
    throw error
  }

  return data
}

// Hide a sales call
export const hideSalesCall = async (callId: string) => {
  const { error } = await supabase
    .from('sales_calls')
    .update({ hidden: true })
    .eq('id', callId)

  if (error) {
    console.error('Error hiding call:', error)
    throw error
  }
}

// Unhide a sales call
export const unhideSalesCall = async (callId: string) => {
  const { error } = await supabase
    .from('sales_calls')
    .update({ hidden: false })
    .eq('id', callId)

  if (error) {
    console.error('Error unhiding call:', error)
    throw error
  }
}

// Delete a sales call permanently
export const deleteSalesCall = async (callId: string) => {
  const { error } = await supabase
    .from('sales_calls')
    .delete()
    .eq('id', callId)

  if (error) {
    console.error('Error deleting call:', error)
    throw error
  }
}

// Classify a single call with Haiku
export const classifySalesCall = async (callId: string) => {
  const { data, error } = await supabase.functions.invoke('classify-sales-call', {
    body: {
      sales_call_id: callId,
    },
  })

  if (error) {
    console.error('Error classifying call:', error)
    throw error
  }

  return data
}

// Get count of unclassified calls
export const getUnclassifiedCallsCount = async () => {
  const { count, error } = await supabase
    .from('sales_calls')
    .select('*', { count: 'exact', head: true })
    .eq('call_type', 'unclassified')
    .eq('hidden', false)

  if (error) {
    console.error('Error counting unclassified calls:', error)
    throw error
  }

  return count || 0
}

// Get all unclassified calls for bulk classification
export const getUnclassifiedCalls = async (limit = 50) => {
  const { data: calls, error } = await supabase
    .from('sales_calls')
    .select('id, title, meeting_title')
    .eq('call_type', 'unclassified')
    .eq('hidden', false)
    .order('recording_start_time', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching unclassified calls:', error)
    throw error
  }

  return calls || []
}

// Get sales analytics over time
export const getSalesAnalytics = async (daysBack: number = 0) => {
  let query = supabase
    .from('sales_call_analysis')
    .select(`
      *,
      sales_call:sales_calls!sales_call_id(
        recording_start_time,
        title,
        meeting_title
      )
    `)

  // Filter by time period if specified
  if (daysBack > 0) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysBack)
    query = query.gte('analyzed_at', cutoffDate.toISOString())
  }

  const { data: analyses, error } = await query.order('analyzed_at', { ascending: true })

  if (error) {
    console.error('Error fetching sales analytics:', error)
    throw error
  }

  if (!analyses || analyses.length === 0) {
    return {
      timeSeriesData: [],
      frameworkBreakdown: [],
      improvementAreas: [],
      topStrengths: [],
      skillProgression: {
        overall: 0,
        discovery: 0,
        objectionHandling: 0,
        closing: 0,
        engagement: 0,
      },
      totalAnalyzedCalls: 0,
    }
  }

  // Time series data for charts
  const timeSeriesData = analyses.map((analysis: any) => ({
    date: new Date(analysis.analyzed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    overall: analysis.overall_score,
    framework: analysis.framework_adherence_score || null,
    discovery: analysis.discovery_score,
    closing: analysis.closing_score,
    engagement: analysis.engagement_score,
  }))

  // Framework stage breakdown (average scores)
  const frameworkBreakdown = [
    { stage: 'Frame Control', score: avg(analyses.map((a: any) => a.frame_control_score)) },
    { stage: 'Current State', score: avg(analyses.map((a: any) => a.discovery_current_state_score)) },
    { stage: 'Desired State', score: avg(analyses.map((a: any) => a.discovery_desired_state_score)) },
    { stage: 'Cost of Inaction', score: avg(analyses.map((a: any) => a.discovery_cost_of_inaction_score)) },
    { stage: 'WATT Tie-downs', score: avg(analyses.map((a: any) => a.watt_tiedowns_score)) },
    { stage: 'Bridge Gap', score: avg(analyses.map((a: any) => a.bridge_gap_score)) },
    { stage: 'Sellback', score: avg(analyses.map((a: any) => a.sellback_score)) },
    { stage: 'Price Drop', score: avg(analyses.map((a: any) => a.price_drop_score)) },
    { stage: 'Objection Handling', score: avg(analyses.map((a: any) => a.objection_handling_score)) },
    { stage: 'Close & Celebrate', score: avg(analyses.map((a: any) => a.close_celebration_score)) },
  ].filter(item => item.score !== null)

  // Identify improvement areas (lowest 3 scores)
  const sortedFramework = [...frameworkBreakdown].sort((a, b) => (a.score || 0) - (b.score || 0))
  const improvementAreas = sortedFramework.slice(0, 3)

  // Top strengths (highest 3 scores)
  const topStrengths = [...frameworkBreakdown].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3)

  // Calculate skill progression (recent vs older)
  const midpoint = Math.floor(analyses.length / 2)
  const recentCalls = analyses.slice(midpoint)
  const olderCalls = analyses.slice(0, midpoint)

  const skillProgression = {
    overall: calcProgression(olderCalls, recentCalls, 'overall_score'),
    discovery: calcProgression(olderCalls, recentCalls, 'discovery_score'),
    objectionHandling: calcProgression(olderCalls, recentCalls, 'objection_handling_score'),
    closing: calcProgression(olderCalls, recentCalls, 'closing_score'),
    engagement: calcProgression(olderCalls, recentCalls, 'engagement_score'),
  }

  // Generate text analysis
  const overallAvg = avg(analyses.map((a: any) => a.overall_score)) || 0
  const textAnalysis = generateTextAnalysis(
    overallAvg,
    topStrengths,
    improvementAreas,
    skillProgression,
    analyses.length
  )

  return {
    timeSeriesData,
    frameworkBreakdown,
    improvementAreas,
    topStrengths,
    skillProgression,
    totalAnalyzedCalls: analyses.length,
    textAnalysis,
  }
}

// Helper functions
const avg = (arr: any[]) => {
  const filtered = arr.filter(n => n != null && n > 0)
  if (filtered.length === 0) return null
  return parseFloat((filtered.reduce((a, b) => a + b, 0) / filtered.length).toFixed(1))
}

const calcProgression = (olderCalls: any[], recentCalls: any[], field: string) => {
  const oldAvg = avg(olderCalls.map((c: any) => c[field]))
  const recentAvg = avg(recentCalls.map((c: any) => c[field]))
  if (oldAvg === null || recentAvg === null) return 0
  return parseFloat((recentAvg - oldAvg).toFixed(1))
}

const generateTextAnalysis = (
  overallScore: number,
  strengths: any[],
  weaknesses: any[],
  progression: any,
  totalCalls: number
) => {
  // Overall performance assessment
  let performanceLevel = ''
  if (overallScore >= 8) performanceLevel = 'excellent'
  else if (overallScore >= 7) performanceLevel = 'strong'
  else if (overallScore >= 6) performanceLevel = 'good'
  else if (overallScore >= 5) performanceLevel = 'developing'
  else performanceLevel = 'needs significant improvement'

  // Trend assessment
  let trendText = ''
  if (progression.overall > 1.5) {
    trendText = 'showing excellent improvement'
  } else if (progression.overall > 0.5) {
    trendText = 'showing steady improvement'
  } else if (progression.overall > 0) {
    trendText = 'showing slight improvement'
  } else if (progression.overall === 0) {
    trendText = 'maintaining consistent performance'
  } else if (progression.overall > -0.5) {
    trendText = 'showing slight decline'
  } else {
    trendText = 'showing concerning decline'
  }

  // Build comprehensive analysis
  const analysis = {
    overview: `Based on ${totalCalls} analyzed sales calls, your overall performance is ${performanceLevel} with an average score of ${overallScore.toFixed(1)}/10. You are ${trendText} compared to your earlier calls.`,

    strengths: strengths.length > 0
      ? `Your strongest areas are ${strengths.map(s => s.stage).join(', ')}. ${strengths[0].stage} is particularly impressive at ${strengths[0].score}/10, indicating you excel at this critical stage of the sales process.`
      : 'Continue analyzing more calls to identify your strengths.',

    improvements: weaknesses.length > 0
      ? `Your primary growth opportunities lie in ${weaknesses.map(w => w.stage).join(', ')}. Focus particularly on ${weaknesses[0].stage} (${weaknesses[0].score}/10), as improving this will have the biggest impact on your close rate.`
      : 'Continue analyzing more calls to identify improvement areas.',

    trend: progression.overall !== 0
      ? progression.overall > 0
        ? `Your recent trajectory is positive with a +${progression.overall} point improvement. ${
            progression.discovery > 0 ? `Discovery skills are improving (+${progression.discovery}), ` : ''
          }${
            progression.closing > 0 ? `and closing ability is strengthening (+${progression.closing}). ` : ''
          }Keep up this momentum!`
        : `Your recent trajectory shows a ${progression.overall} point decline. ${
            progression.discovery < 0 ? `Discovery needs attention (${progression.discovery}), ` : ''
          }${
            progression.closing < 0 ? `and closing requires focus (${progression.closing}). ` : ''
          }Review recent calls to identify what changed.`
      : 'Your performance is consistent across recent calls.',

    recommendation: weaknesses.length > 0 && strengths.length > 0
      ? `Actionable next step: During your next call, leverage your strength in ${strengths[0].stage.toLowerCase()} while specifically practicing ${weaknesses[0].stage.toLowerCase()}. Record the call and immediately review how you handled this weak area.`
      : 'Continue analyzing calls to get personalized recommendations.',
  }

  return analysis
}
