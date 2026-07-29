import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { type StoredEpisode, transcriptEpisodeTitle } from './podcastEpisodes.ts'

function episode(title: string, extra: Partial<StoredEpisode> = {}): StoredEpisode {
  return {
    episode_id: title,
    title,
    description: '',
    posted_at: null,
    url: null,
    audio_url: null,
    image_url: null,
    duration_seconds: null,
    word_count: null,
    has_guests: false,
    hosts: [],
    guests: [],
    summary: null,
    keywords: [],
    topics: [],
    ...extra,
  }
}

Deno.test('the transcript is attributed to the episode it came from', () => {
  // Podscan returns episodes whether or not transcription has finished, so the
  // newest episode is the likeliest to have none. The one that supplied the
  // transcript carries the flag.
  const episodes = [
    episode('Newest, still processing'),
    episode('Earlier, transcribed', { transcript_source: true }),
    episode('Older still'),
  ]
  assertEquals(transcriptEpisodeTitle(episodes), 'Earlier, transcribed')
})

Deno.test('a capture written before the flag falls back to the newest episode', () => {
  const episodes = [episode('Newest'), episode('Earlier')]
  assertEquals(transcriptEpisodeTitle(episodes), 'Newest')
})

Deno.test('no episodes means nothing to attribute', () => {
  assertEquals(transcriptEpisodeTitle([]), null)
})
