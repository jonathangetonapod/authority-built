import { supabase } from '@/lib/supabase'

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
  created_at: string
  updated_at: string
}

export interface SalesCallAnalysis {
  id: string
  sales_call_id: string
  overall_score: number
  discovery_score: number
  objection_handling_score: number
  closing_score: number
  engagement_score: number
  talk_listen_ratio_talk: number
  talk_listen_ratio_listen: number
  questions_asked_count: number
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
export const syncFathomCalls = async () => {
  const { data, error } = await supabase.functions.invoke('sync-fathom-calls')

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
    .select('*')
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

// Get recent calls for list view
export const getRecentSalesCalls = async (limit = 10) => {
  const calls = await getSalesCallsWithAnalysis()
  return calls.slice(0, limit)
}
