import { supabase } from '@/lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export interface PodcastForScoring {
  podcast_id: string
  podcast_name: string
  podcast_description?: string | null
  publisher_name?: string | null
  podcast_categories?: Array<{ category_name: string }> | null
  audience_size?: number | null
  episode_count?: number | null
}

export interface CompatibilityScore {
  podcast_id: string
  score: number | null
  reasoning?: string
}

/**
 * Score multiple podcasts in parallel batches for client OR prospect
 * Processes in chunks to avoid rate limits and improve UX
 */
/** Thrown when the workspace has no credits left, so the caller can stop. */
export class InsufficientCreditsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InsufficientCreditsError'
  }
}

/** Some batches scored, some did not. Carries what did, so it is not lost. */
export class PartialScoringError extends Error {
  constructor(message: string, readonly scored: CompatibilityScore[], readonly failedCount: number) {
    super(message)
    this.name = 'PartialScoringError'
  }
}

export async function scoreCompatibilityBatch(
  bio: string,
  podcasts: PodcastForScoring[],
  batchSize: number = 10,
  onProgress?: (completed: number, total: number) => void,
  isProspectMode: boolean = false,
  scope?: (
    | { workspaceId: string; clientId: string; prospectDashboardId?: never }
    | { workspaceId: string; prospectDashboardId: string; clientId?: never }
  ),
): Promise<CompatibilityScore[]> {
  if (!bio || bio.trim().length === 0) {
    throw new Error(`${isProspectMode ? 'Prospect' : 'Client'} bio is required for compatibility scoring`)
  }

  if (podcasts.length === 0) {
    return []
  }

  // Get the authenticated user's JWT token
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('You must be logged in to score podcasts')
  }

  const results: CompatibilityScore[] = []
  let completed = 0
  let failedBatches = 0
  let failedPodcasts = 0

  // Process in batches
  for (let i = 0; i < podcasts.length; i += batchSize) {
    const batch = podcasts.slice(i, i + batchSize)

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/score-podcast-compatibility`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(scope
          ? {
              workspaceId: scope.workspaceId,
              ...('prospectDashboardId' in scope
                ? { prospectDashboardId: scope.prospectDashboardId }
                : { clientId: scope.clientId }),
              podcasts: batch,
            }
          : {
              clientBio: isProspectMode ? undefined : bio,
              prospectBio: isProspectMode ? bio : undefined,
              podcasts: batch,
            }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: string }
        const message = error.error || 'Failed to score podcasts'
        // Running out of credits is not a batch that happened to fail. Every
        // remaining batch will fail the same way, and swallowing it here left
        // the caller reporting a complete ranking built from nulls.
        if (response.status === 402) throw new InsufficientCreditsError(message)
        throw new Error(message)
      }

      const data = await response.json()
      results.push(...data.scores)

      completed += batch.length
      if (onProgress) {
        onProgress(completed, podcasts.length)
      }

      // Small delay between batches to be nice to the API
      if (i + batchSize < podcasts.length) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch (error) {
      if (error instanceof InsufficientCreditsError) throw error
      console.error('Error scoring batch:', error)
      // Counted, not just swallowed: a run where every batch failed used to
      // report "scoring completed" with nothing scored.
      failedBatches += 1
      failedPodcasts += batch.length
      batch.forEach(podcast => {
        results.push({ podcast_id: podcast.podcast_id, score: null })
      })
      completed += batch.length
      if (onProgress) {
        onProgress(completed, podcasts.length)
      }
    }
  }

  if (failedBatches > 0) {
    throw new PartialScoringError(
      `${podcasts.length - failedPodcasts} of ${podcasts.length} scored before the rest failed.`,
      results,
      failedPodcasts,
    )
  }
  return results
}

/**
 * Score all podcasts and return sorted by score
 */
export async function scoreAndRankPodcasts(
  bio: string,
  podcasts: PodcastForScoring[],
  minScore: number = 7,
  onProgress?: (completed: number, total: number) => void,
  isProspectMode: boolean = false
): Promise<Array<PodcastForScoring & { compatibility_score: number }>> {
  // Score all podcasts
  const scores = await scoreCompatibilityBatch(bio, podcasts, 10, onProgress, isProspectMode)

  // Create lookup map
  const scoreMap = new Map<string, number>()
  scores.forEach(s => {
    if (s.score !== null) {
      scoreMap.set(s.podcast_id, s.score)
    }
  })

  // Filter and rank
  const rankedPodcasts = podcasts
    .map(podcast => ({
      ...podcast,
      compatibility_score: scoreMap.get(podcast.podcast_id) || 0,
    }))
    .filter(p => p.compatibility_score >= minScore)
    .sort((a, b) => {
      // Sort by: score desc, then audience desc, then name asc
      if (b.compatibility_score !== a.compatibility_score) {
        return b.compatibility_score - a.compatibility_score
      }
      if ((b.audience_size || 0) !== (a.audience_size || 0)) {
        return (b.audience_size || 0) - (a.audience_size || 0)
      }
      return a.podcast_name.localeCompare(b.podcast_name)
    })

  return rankedPodcasts
}

/**
 * Get compatibility score explanation
 * Note: This is currently not used in the UI but kept for future use
 */
export async function getScoreExplanation(
  clientBio: string,
  podcast: PodcastForScoring,
  score: number
): Promise<string> {
  // TODO: Implement Edge Function for score explanation if needed
  return `This podcast scored ${score}/10 for compatibility based on alignment between the client's expertise and the podcast's focus.`
}
