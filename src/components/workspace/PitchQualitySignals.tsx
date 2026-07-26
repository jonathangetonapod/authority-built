import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { countWords, wordCountStatus, type PitchWordTarget } from '@/lib/pitchQuality'

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
