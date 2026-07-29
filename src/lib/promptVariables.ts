// GENERATED from docs/prompt-variables.json by scripts/generate-prompt-variables.mjs.
// Frontend mirror of supabase/functions/_shared/promptVariables.ts. Do not
// hand-edit; regenerate. Feeds the prompt editor's field list.

export type PromptVariableGroup = 'podcast' | 'episode' | 'client' | 'run'

export type PromptVariableType =
  | 'text'
  | 'long_text'
  | 'number'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'list'
  | 'object'

export interface PromptVariable {
  id: string
  group: PromptVariableGroup
  type: PromptVariableType
  label: string
  /** Podcast-group only: the podcasts column this reads. */
  column?: string
  /** Run-group only: the stage that produces it. */
  producedBy?: string
}

export const PROMPT_VARIABLES: PromptVariable[] = [
  { id: 'podcast_name', group: 'podcast', column: 'podcast_name', type: 'text', label: "Podcast name" },
  { id: 'podcast_description', group: 'podcast', column: 'podcast_description', type: 'long_text', label: "Description" },
  { id: 'podcast_url', group: 'podcast', column: 'podcast_url', type: 'text', label: "Podcast URL" },
  { id: 'podcast_website', group: 'podcast', column: 'website', type: 'text', label: "Show website" },
  { id: 'publisher_name', group: 'podcast', column: 'publisher_name', type: 'text', label: "Publisher" },
  { id: 'podcast_categories', group: 'podcast', column: 'podcast_categories', type: 'list', label: "Categories" },
  { id: 'language', group: 'podcast', column: 'language', type: 'text', label: "Language" },
  { id: 'region', group: 'podcast', column: 'region', type: 'text', label: "Region" },
  { id: 'episode_count', group: 'podcast', column: 'episode_count', type: 'number', label: "Episodes published" },
  { id: 'last_posted_at', group: 'podcast', column: 'last_posted_at', type: 'date', label: "Last episode posted" },
  { id: 'audience_size', group: 'podcast', column: 'audience_size', type: 'number', label: "Audience size" },
  { id: 'podcast_reach_score', group: 'podcast', column: 'podcast_reach_score', type: 'number', label: "Reach score" },
  { id: 'itunes_rating', group: 'podcast', column: 'itunes_rating', type: 'decimal', label: "Apple rating" },
  { id: 'itunes_rating_count', group: 'podcast', column: 'itunes_rating_count', type: 'number', label: "Apple ratings" },
  { id: 'spotify_rating', group: 'podcast', column: 'spotify_rating', type: 'decimal', label: "Spotify rating" },
  { id: 'spotify_rating_count', group: 'podcast', column: 'spotify_rating_count', type: 'number', label: "Spotify ratings" },
  { id: 'podcast_has_guests', group: 'podcast', column: 'podcast_has_guests', type: 'boolean', label: "Takes guests" },
  { id: 'podcast_has_sponsors', group: 'podcast', column: 'podcast_has_sponsors', type: 'boolean', label: "Runs sponsors" },
  { id: 'social_links', group: 'podcast', column: 'social_links', type: 'object', label: "Social links" },
  { id: 'demographics', group: 'podcast', column: 'demographics', type: 'object', label: "Audience demographics" },
  { id: 'demographics_episodes_analyzed', group: 'podcast', column: 'demographics_episodes_analyzed', type: 'number', label: "Episodes behind the demographics" },
  { id: 'brand_safety_risk_level', group: 'podcast', column: 'brand_safety_risk_level', type: 'text', label: "Brand safety risk" },
  { id: 'brand_safety_recommendation', group: 'podcast', column: 'brand_safety_recommendation', type: 'long_text', label: "Brand safety note" },
  { id: 'episode_title', group: 'episode', type: 'text', label: "Latest episode title" },
  { id: 'episode_description', group: 'episode', type: 'long_text', label: "Latest episode summary" },
  { id: 'episode_transcript', group: 'episode', type: 'long_text', label: "Latest episode transcript" },
  { id: 'client_name', group: 'client', type: 'text', label: "Client name" },
  { id: 'client_bio', group: 'client', type: 'long_text', label: "Client bio and positioning" },
  { id: 'client_linkedin_url', group: 'client', type: 'text', label: "Client LinkedIn" },
  { id: 'client_website', group: 'client', type: 'text', label: "Client website" },
  { id: 'research_report', group: 'run', type: 'long_text', label: "Podcast research result", producedBy: 'podcast_research' },
  { id: 'host_report', group: 'run', type: 'long_text', label: "Host identification result", producedBy: 'host_info' },
  { id: 'guest_report', group: 'run', type: 'long_text', label: "Guest verification result", producedBy: 'guest_info' },
  { id: 'recent_guest_name', group: 'run', type: 'text', label: "Most recent guest", producedBy: 'guest_info' },
  { id: 'topic_proposal', group: 'run', type: 'long_text', label: "Topic alignment result", producedBy: 'find_topics' },
  { id: 'host_name', group: 'run', type: 'text', label: "Primary contact name", producedBy: 'host_name_extractor' },
  { id: 'contact_data', group: 'run', type: 'long_text', label: "Contact data to extract from", producedBy: 'podcast_research' },
  { id: 'verified_email', group: 'run', type: 'text', label: "Verified contact email", producedBy: 'email_unlock' },
  { id: 'sequence_json', group: 'run', type: 'long_text', label: "Drafted sequence, as JSON", producedBy: 'write_email' },
  { id: 'audit_flags', group: 'run', type: 'long_text', label: "Problems found in the draft", producedBy: 'write_email' },
  { id: 'placeholders', group: 'run', type: 'long_text', label: "Unfilled placeholders in the draft", producedBy: 'write_email' },
  { id: 'positioning', group: 'client', type: 'long_text', label: "Client positioning" },
  { id: 'topics_and_angles', group: 'client', type: 'long_text', label: "Client topics and angles" },
  { id: 'listener_takeaways', group: 'client', type: 'long_text', label: "Listener takeaways" },
  { id: 'proof_points', group: 'client', type: 'long_text', label: "Client proof points" },
  { id: 'booking_details', group: 'client', type: 'long_text', label: "Booking and scheduling details" },
  { id: 'podcast_research', group: 'run', type: 'long_text', label: "Podcast research result, for the inbox", producedBy: 'podcast_research' },
  { id: 'pitch_sent', group: 'run', type: 'long_text', label: "The pitch this reply answers", producedBy: 'write_email' },
  { id: 'reply_subject', group: 'run', type: 'text', label: "Subject of the host reply", producedBy: 'inbox' },
  { id: 'reply_body', group: 'run', type: 'long_text', label: "Body of the host reply", producedBy: 'inbox' },
]
