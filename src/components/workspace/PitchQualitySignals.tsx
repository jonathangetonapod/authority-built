import { AlertTriangle, CheckCircle2, Handshake, MessageSquare, ShieldCheck, Ban } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { countWords, wordCountStatus, type PitchWordTarget } from '@/lib/pitchQuality'
import type { ClientShortlistAgencyRelationship } from '@/services/clientShortlist'

/**
 * What this workspace already means to a host, shown before any pitch is
 * written. The agency pitches the same show for many clients over time, and
 * opening cold on a host you are mid conversation with — or who already
 * hosted one of your guests — is the mistake this exists to prevent.
 */
export const AgencyRelationshipNotice = ({ relationship }: { relationship?: ClientShortlistAgencyRelationship | null }) => {
  if (!relationship || relationship.state === 'none') return null
  const contactedOn = relationship.last_contacted_at
    ? new Date(relationship.last_contacted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  const view = {
    booked: {
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-950',
      icon: <Handshake className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />,
      title: `You have placed a guest on this show`,
      detail: `${relationship.booked_client_name ?? 'A client'} appeared here${relationship.booked_at ? ` on ${new Date(relationship.booked_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : ''}. The pitch will open as a warm follow-on rather than an introduction.`,
    },
    replied: {
      tone: 'border-sky-200 bg-sky-50 text-sky-950',
      icon: <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />,
      title: 'This host has corresponded with you before',
      detail: `You exchanged messages${contactedOn ? ` around ${contactedOn}` : ''} for another client. The pitch will acknowledge that instead of opening cold.`,
    },
    pitched: {
      tone: 'border-muted bg-muted/40 text-foreground',
      icon: <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />,
      title: 'Pitched before, no reply',
      detail: `${relationship.last_client_name ?? 'Another client'} was pitched here${contactedOn ? ` on ${contactedOn}` : ''} and the host did not respond. The new pitch will not mention it.`,
    },
    in_conversation: {
      tone: 'border-destructive/30 bg-destructive/5 text-destructive',
      icon: <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />,
      title: 'A conversation with this host is already live',
      detail: `There is an open thread${relationship.last_client_name ? ` for ${relationship.last_client_name}` : ''}. Continue it in Master Inbox — starting cold outreach here is blocked.`,
    },
    suppressed: {
      tone: 'border-destructive/30 bg-destructive/5 text-destructive',
      icon: <Ban className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />,
      title: 'This host asked not to be contacted',
      detail: 'The opt-out applies to every client in this workspace. Outreach is blocked.',
    },
  }[relationship.state]

  return (
    <div className={`rounded-xl border p-3 ${view.tone}`} aria-label="Agency relationship with this host">
      <div className="flex gap-2.5">
        {view.icon}
        <div className="min-w-0">
          <p className="text-xs font-semibold">{view.title}</p>
          <p className="mt-0.5 text-[11px] leading-4 opacity-90">{view.detail}</p>
          {relationship.same_contact_other_show && (
            <p className="mt-1 text-[11px] font-medium leading-4">
              The same contact also hosts another show you have emailed — this is the same person, not a new introduction.
            </p>
          )}
          {relationship.booked_episode_url && (
            <a
              href={relationship.booked_episode_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-[11px] font-semibold underline underline-offset-2"
            >
              Listen to that episode
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

interface PitchTrustPanelProps {
  /** Unresolved claim-audit flags from generation (server-side judgement). */
  auditFlags: string[]
  /** Style issues recomputed live from the copy currently in the editor. */
  liveIssues?: string[]
  /** What the pitch was written from, shown so the operator can trust it. */
  grounding?: { episodeTitle?: string | null; guestName?: string | null; hostName?: string | null }
  /** False before a pitch has been generated — the panel stays hidden. */
  generated: boolean
}

/**
 * The trust signal, shown both where the sequence is previewed and where it
 * is finalized. Silence is not confidence: when nothing is wrong this says
 * so explicitly, because an operator who never sees the check cannot know it
 * ran.
 */
export const PitchTrustPanel = ({ auditFlags, liveIssues = [], grounding, generated }: PitchTrustPanelProps) => {
  if (!generated) return null
  const issues = [...new Set([...auditFlags, ...liveIssues])]
  const clean = issues.length === 0
  const groundingChips = [
    grounding?.hostName ? `Host: ${grounding.hostName}` : null,
    grounding?.episodeTitle ? `Episode: ${grounding.episodeTitle}` : null,
    grounding?.guestName ? `Guest: ${grounding.guestName}` : null,
  ].filter((chip): chip is string => Boolean(chip))

  return (
    <div
      className={`rounded-xl border p-3 ${clean ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/80'}`}
      aria-label="Pitch trust check"
    >
      <div className="flex gap-2.5">
        {clean
          ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
          : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />}
        <div className="min-w-0">
          <p className={`text-xs font-semibold ${clean ? 'text-emerald-950' : 'text-amber-950'}`}>
            {clean ? 'Trust check passed' : `Review before sending · ${issues.length} to check`}
          </p>
          <p className={`mt-0.5 text-[11px] leading-4 ${clean ? 'text-emerald-900/75' : 'text-amber-900/80'}`}>
            {clean
              ? 'Every claim traces to the research, and the copy clears the length and phrasing rules hosts respond to.'
              : 'These were found in the copy below. Fix them here, or regenerate the sequence.'}
          </p>
          {!clean && (
            <ul className="mt-1.5 space-y-0.5 text-[11px] leading-4 text-amber-950">
              {issues.slice(0, 6).map((issue) => <li key={issue}>• {issue}</li>)}
            </ul>
          )}
          {clean && groundingChips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {groundingChips.map((chip) => (
                <Badge key={chip} variant="outline" className="border-emerald-200 bg-white/70 font-normal text-emerald-900">
                  <CheckCircle2 className="mr-1 h-3 w-3" />{chip}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface PitchWordCountProps {
  text: string
  target: PitchWordTarget
}

/** Live length feedback against the research-backed target for this email. */
export const PitchWordCount = ({ text, target }: PitchWordCountProps) => {
  const count = countWords(text)
  const status = wordCountStatus(count, target)
  const tone = status === 'ideal'
    ? 'text-emerald-700'
    : status === 'over'
      ? 'text-destructive'
      : status === 'long'
        ? 'text-amber-700'
        : 'text-muted-foreground'
  return (
    <span className={`text-[11px] font-medium tabular-nums ${tone}`}>
      {count} {count === 1 ? 'word' : 'words'}
      <span className="font-normal text-muted-foreground"> · aim for {target.min}–{target.max}</span>
      {status === 'over' && <span className="ml-1 font-semibold">too long for a cold pitch</span>}
    </span>
  )
}
