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
  | 'episode_list'

export interface PromptVariable {
  id: string
  group: PromptVariableGroup
  type: PromptVariableType
  label: string
  /** Podcast- and client-group only: the table column this reads. */
  column?: string
  /** Client-group only: the clients.ai_sdr_profile key this reads. */
  profile?: string
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
  { id: 'podcast_host_name', group: 'podcast', column: 'host_name', type: 'text', label: "Host name (Podscan)" },
  { id: 'podcast_is_active', group: 'podcast', column: 'is_active', type: 'boolean', label: "Still publishing" },
  { id: 'podcast_inbox_email', group: 'podcast', column: 'podscan_email', type: 'text', label: "Show inbox (Podscan)" },
  { id: 'podcast_rss_url', group: 'podcast', column: 'rss_url', type: 'text', label: "RSS feed" },
  { id: 'podcast_image_url', group: 'podcast', column: 'podcast_image_url', type: 'text', label: "Cover art URL" },
  { id: 'demographics_fetched_at', group: 'podcast', column: 'demographics_fetched_at', type: 'date', label: "Demographics captured" },
  { id: 'episodes_fetched_at', group: 'podcast', column: 'episodes_fetched_at', type: 'date', label: "Episodes captured" },
  { id: 'episode_title', group: 'episode', type: 'text', label: "Latest episode title" },
  { id: 'episode_description', group: 'episode', type: 'long_text', label: "Latest episode summary" },
  { id: 'episode_transcript', group: 'episode', type: 'long_text', label: "Latest episode transcript" },
  { id: 'episode_posted_at', group: 'episode', type: 'date', label: "Latest episode posted" },
  { id: 'episode_summary', group: 'episode', type: 'long_text', label: "Latest episode summary (Podscan)" },
  { id: 'episode_topics', group: 'episode', type: 'list', label: "Latest episode topics" },
  { id: 'episode_keywords', group: 'episode', type: 'list', label: "Latest episode keywords" },
  { id: 'episode_guests', group: 'episode', type: 'list', label: "Latest episode guests" },
  { id: 'episode_hosts', group: 'episode', type: 'list', label: "Latest episode hosts" },
  { id: 'episode_has_guests', group: 'episode', type: 'boolean', label: "Latest episode had a guest" },
  { id: 'episode_url', group: 'episode', type: 'text', label: "Latest episode URL" },
  { id: 'episode_duration_seconds', group: 'episode', type: 'number', label: "Latest episode length, seconds" },
  { id: 'episode_word_count', group: 'episode', type: 'number', label: "Latest episode word count" },
  { id: 'recent_episodes', group: 'episode', type: 'episode_list', label: "Recent episodes, newest first" },
  { id: 'client_name', group: 'client', column: 'name', type: 'text', label: "Client name" },
  { id: 'client_bio', group: 'client', column: 'bio', type: 'long_text', label: "Client bio and positioning" },
  { id: 'client_linkedin_url', group: 'client', column: 'linkedin_url', type: 'text', label: "Client LinkedIn" },
  { id: 'client_website', group: 'client', column: 'website', type: 'text', label: "Client website" },
  { id: 'client_calendar_link', group: 'client', column: 'calendar_link', type: 'text', label: "Client booking link" },
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
  { id: 'positioning', group: 'client', profile: 'positioning', type: 'long_text', label: "Client positioning" },
  { id: 'topics_and_angles', group: 'client', profile: 'topics_and_angles', type: 'long_text', label: "Client topics and angles" },
  { id: 'listener_takeaways', group: 'client', profile: 'listener_takeaways', type: 'long_text', label: "Listener takeaways" },
  { id: 'proof_points', group: 'client', profile: 'proof_points', type: 'long_text', label: "Client proof points" },
  { id: 'ideal_opportunities', group: 'client', profile: 'ideal_opportunities', type: 'long_text', label: "Ideal shows and audiences" },
  { id: 'booking_details', group: 'client', profile: 'booking_details', type: 'long_text', label: "Booking and scheduling details" },
  { id: 'podcast_research', group: 'run', type: 'long_text', label: "Podcast research result, for the inbox", producedBy: 'podcast_research' },
  { id: 'pitch_sent', group: 'run', type: 'long_text', label: "The pitch this reply answers", producedBy: 'write_email' },
  { id: 'reply_subject', group: 'run', type: 'text', label: "Subject of the host reply", producedBy: 'inbox' },
  { id: 'reply_body', group: 'run', type: 'long_text', label: "Body of the host reply", producedBy: 'inbox' },
  { id: 'agency_relationship', group: 'run', type: 'long_text', label: "What this agency already means to this host", producedBy: 'relationship' },
  { id: 'clean_description', group: 'run', type: 'long_text', label: "Show summary, structured", producedBy: 'structure_research' },
  { id: 'fit_reasons', group: 'run', type: 'list', label: "Why this guest fits, structured", producedBy: 'structure_research' },
  { id: 'pitch_angles', group: 'run', type: 'long_text', label: "All three angles, structured", producedBy: 'structure_research' },
  { id: 'selected_angle', group: 'run', type: 'long_text', label: "The angle this pitch was asked for", producedBy: 'structure_research' },
]
