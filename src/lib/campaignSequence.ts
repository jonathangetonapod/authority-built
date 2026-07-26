import { decodeHtmlEntities } from '@/lib/htmlEntities'
import type { ClientShortlistPodcast } from '@/services/clientShortlist'

export interface PodcastCampaignSequenceDraft {
  researchNotes: string
  subject: string
  pitchBody: string
  followUpOneSubject: string
  followUpOneBody: string
  followUpTwoSubject: string
  followUpTwoBody: string
}

interface BuildPodcastCampaignSequenceDraftInput {
  podcast: ClientShortlistPodcast
  clientName: string
  clientBio?: string | null
  angleIndex?: number
}

function sentence(value: string | null | undefined, max: number): string {
  const clean = value?.replace(/\s+/g, ' ').trim() || ''
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1).trimEnd()}…`
}

export function buildThreadReplySubject(subject: string): string {
  const clean = subject.trim().replace(/^(?:re:\s*)+/iu, '')
  return clean ? `Re: ${clean}` : ''
}

export function buildPodcastCampaignSequenceDraft({
  podcast,
  clientName,
  clientBio,
  angleIndex = 0,
}: BuildPodcastCampaignSequenceDraftInput): PodcastCampaignSequenceDraft {
  void clientBio
  // Catalog names arrive HTML-encoded from Podscan ("Good, Bad, &amp; the
  // Ugly") — decode once so no entity ever reaches an email a host reads.
  const podcastName = decodeHtmlEntities(podcast.podcast_name)
  const angle = podcast.ai_pitch_angles?.[angleIndex] || podcast.ai_pitch_angles?.[0] || null
  const fitReason = podcast.ai_fit_reasons?.[0] || null
  const podcastSummary = sentence(decodeHtmlEntities(podcast.ai_clean_description || podcast.podcast_description || ''), 420)
  const secondFitReason = podcast.ai_fit_reasons?.[1] || null
  const contactFirstName = podcast.publisher_name?.trim().split(/\s+/)[0] || ''
  const greeting = contactFirstName ? `Hi ${contactFirstName},` : 'Hi,'
  const subject = `Guest idea for ${podcastName}: ${clientName}`
  const angleLine = angle
    ? `One conversation angle that stood out is “${angle.title}” — ${sentence(angle.description, 500)}`
    : `${clientName} could bring a practical, audience-first conversation tailored to ${podcastName}.`
  const fitLine = fitReason
    ? sentence(fitReason, 500)
    : `${clientName}'s experience creates a natural fit for the show's audience.`
  const clientLine = secondFitReason ? sentence(secondFitReason, 420) : ''
  const researchNotes = [
    podcastSummary ? `Show brief: ${podcastSummary}` : null,
    `Audience fit: ${fitLine}`,
    angle ? `Recommended angle: ${angle.title} — ${sentence(angle.description, 700)}` : null,
  ].filter(Boolean).join('\n\n')

  return {
    researchNotes,
    subject,
    pitchBody: [
      greeting,
      `I’ve been researching ${podcastName} and wanted to share a guest idea that feels genuinely aligned with the show.`,
      fitLine,
      clientLine,
      angleLine,
      `Would you be open to exploring ${clientName} as a guest? I’m happy to send a few tailored talking points for your audience.`,
      'Best,',
    ].filter(Boolean).join('\n\n'),
    followUpOneSubject: buildThreadReplySubject(subject),
    followUpOneBody: [
      greeting,
      `Just following up on the guest idea for ${podcastName}.`,
      angle
        ? `The conversation around “${angle.title}” could give your audience a useful, practical takeaway.`
        : `${clientName} can tailor the conversation around the topics your audience cares about most.`,
      'Would it be helpful if I sent over a short set of possible talking points?',
      'Best,',
    ].join('\n\n'),
    followUpTwoSubject: buildThreadReplySubject(subject),
    followUpTwoBody: [
      greeting,
      `One last note on the guest idea for ${podcastName}.`,
      `If ${clientName} is not the right fit right now, no problem. If the angle is close, I’d be glad to tailor it around an upcoming theme or episode you are planning.`,
      'Thanks for considering it.',
      'Best,',
    ].join('\n\n'),
  }
}
