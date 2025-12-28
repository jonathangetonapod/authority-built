import { supabase } from '@/lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export interface CreateSheetResult {
  success: boolean
  spreadsheetUrl: string
  spreadsheetId: string
  message: string
}

export interface PodcastExportData {
  podcast_name: string
  publisher_name?: string | null
  podcast_description?: string | null
  audience_size?: number | null
  episode_count?: number | null
  itunes_rating?: number | null
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
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create Google Sheet')
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
