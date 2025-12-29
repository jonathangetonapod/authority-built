import { supabase } from '@/lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export interface CreateSheetResult {
  success: boolean
  spreadsheetUrl: string
  spreadsheetId: string
  message: string
}

export interface PodcastExportData {
  podcast_name: string
  podcast_description?: string | null
  itunes_rating?: number | null
  episode_count?: number | null
  podscan_podcast_id?: string | null
  podcast_id?: string | null  // Fallback if podscan_podcast_id not available
  // Legacy fields (not currently exported to sheets):
  publisher_name?: string | null
  audience_size?: number | null
  podcast_url?: string | null
  podcast_email?: string | null
  rss_feed?: string | null
  compatibility_score?: number | null
  compatibility_reasoning?: string | null
}

export interface ExportToSheetsResult {
  success: boolean
  rowsAdded: number
  updatedRange: string
}

export interface OutreachPodcast {
  podcast_id: string
  podcast_name: string
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  itunes_rating: number | null
  episode_count: number | null
  audience_size: number | null
}

export interface GetOutreachPodcastsResult {
  success: boolean
  podcasts: OutreachPodcast[]
  total: number
}

/**
 * Create a new Google Sheet for a client with formatted headers
 */
export async function createClientGoogleSheet(
  clientId: string,
  clientName: string
): Promise<CreateSheetResult> {
  if (!clientId || !clientName) {
    throw new Error('Client ID and name are required')
  }

  try {
    // Get the authenticated user's JWT token
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw new Error('You must be logged in to create a Google Sheet')
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-client-google-sheet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        clientId,
        clientName,
        ownerEmail: session.user.email, // Transfer ownership to logged-in user
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Create sheet error response:', error)
      throw new Error(error.error || error.details || 'Failed to create Google Sheet')
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Error creating Google Sheet:', error)
    throw new Error(`Failed to create Google Sheet: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Export podcasts to a client's Google Sheet
 */
export async function exportPodcastsToGoogleSheets(
  clientId: string,
  podcasts: PodcastExportData[]
): Promise<ExportToSheetsResult> {
  if (!clientId) {
    throw new Error('Client ID is required')
  }

  if (!podcasts || podcasts.length === 0) {
    throw new Error('At least one podcast must be selected for export')
  }

  try {
    // Get the authenticated user's JWT token
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw new Error('You must be logged in to export podcasts')
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/export-to-google-sheets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        clientId,
        podcasts,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to export to Google Sheets')
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Error exporting to Google Sheets:', error)
    throw new Error(`Failed to export podcasts: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Get outreach podcasts from a client's Google Sheet
 * Reads column E (Podscan Podcast IDs) and fetches podcast details
 */
export async function getClientOutreachPodcasts(
  clientId: string
): Promise<GetOutreachPodcastsResult> {
  if (!clientId) {
    throw new Error('Client ID is required')
  }

  try {
    // Fetch podcast IDs from Edge Function (no auth required - Edge Function validates internally)
    const response = await fetch(`${SUPABASE_URL}/functions/v1/get-client-outreach-podcasts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        clientId,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to fetch outreach podcasts')
    }

    const data = await response.json()

    // If no podcast IDs, return empty
    if (!data.podcastIds || data.podcastIds.length === 0) {
      return { success: true, podcasts: [], total: 0 }
    }

    console.log('[getClientOutreachPodcasts] Fetching details for', data.podcastIds.length, 'podcasts from frontend')

    // Fetch podcast details from Podscan API (from frontend where DNS works)
    const podcasts: OutreachPodcast[] = []
    const podscanApiKey = import.meta.env.VITE_PODSCAN_API_KEY

    for (const podcastId of data.podcastIds) {
      try {
        const podcastResponse = await fetch(
          `https://podscan.fm/api/v1/podcasts/${podcastId}`,
          {
            headers: {
              'Authorization': `Bearer ${podscanApiKey}`,
            },
          }
        )

        if (podcastResponse.ok) {
          const data = await podcastResponse.json()
          // API returns { podcast: { ... } }, extract the podcast object
          const podcast = data.podcast || data
          console.log('[getClientOutreachPodcasts] Podcast data:', podcastId, podcast)

          podcasts.push({
            podcast_id: podcastId,
            podcast_name: podcast.podcast_name || 'Unknown Podcast',
            podcast_description: podcast.podcast_description || null,
            podcast_image_url: podcast.podcast_image_url || null,
            podcast_url: podcast.podcast_url || null,
            publisher_name: podcast.publisher_name || null,
            itunes_rating: podcast.reach?.itunes?.itunes_rating_average || null,
            episode_count: podcast.episode_count || null,
            audience_size: podcast.reach?.audience_size || null,
          })
        }
      } catch (error) {
        console.error('[getClientOutreachPodcasts] Error fetching podcast:', podcastId, error)
      }
    }

    console.log('[getClientOutreachPodcasts] Successfully fetched', podcasts.length, 'podcasts')

    return {
      success: true,
      podcasts,
      total: podcasts.length,
    }
  } catch (error) {
    console.error('Error fetching outreach podcasts:', error)
    throw new Error(`Failed to fetch outreach podcasts: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
