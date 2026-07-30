import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { PROMPT_VARIABLES } from '@/lib/promptVariables'
import { referencedPromptVariables } from '@/lib/promptVariableMenu'
import type { PromptPreview } from '@/services/clientShortlist'

interface PromptFieldPreviewProps {
  /** The prompt being edited; its {{tokens}} decide what is shown. */
  content: string
  preview: PromptPreview | null
  loading?: boolean
  /** The read failed. Distinct from having no podcast open. */
  error?: boolean
  onRetry?: () => void
  /** Fields this stage refuses to run without, marked as blocking not merely empty. */
  requiredVariableIds?: string[]
  podcastName?: string | null
  /**
   * Ask Podscan again for this show. Offered only where episode fields are
   * empty, because that is the only gap a provider read can close — a missing
   * client bio or an unrun stage will not change.
   */
  onRefreshEpisodes?: () => void
  refreshing?: boolean
}

const LABELS = new Map(PROMPT_VARIABLES.map((variable) => [variable.id, variable]))

/**
 * Why this field is empty, read off the field itself.
 *
 * This used to be chosen by one flag for the whole preview: before research
 * had run, every empty field claimed "written by an earlier stage". That is
 * false for most of them — episode_title and episode_transcript come from the
 * stored episode capture, and no prompt will ever write them, so the sentence
 * pointed the operator at the wrong fix. The registry already records which
 * fields a stage produces, so ask it instead.
 */
const explainEmpty = (variableId: string): string => {
  const variable = LABELS.get(variableId)
  if (variable?.producedBy) {
    return `Nothing stored yet — written by the ${variable.producedBy} stage, which has not run for this podcast.`
  }
  // A client field is empty for every podcast, not for this one: saying "not
  // available for this podcast" would send someone looking at the show when
  // the gap is in the client record.
  if (variable?.group === 'client') {
    return 'Missing from the client record — the model is told exactly that.'
  }
  return 'Not available for this podcast — the model is told exactly that.'
}

/**
 * What this prompt will actually receive, for the podcast in front of you.
 *
 * The editor used to describe its inputs from a hand-written switch that
 * answered "Mapped at run time" for two thirds of the registry. These values
 * are built server-side by the same function the run uses, so a field shown as
 * empty here is a field the model will be told is "Not available" — which is
 * the thing worth knowing before writing a sentence that depends on it.
 */
export const PromptFieldPreview = ({
  content,
  preview,
  loading,
  error,
  onRetry,
  requiredVariableIds,
  podcastName,
  onRefreshEpisodes,
  refreshing,
}: PromptFieldPreviewProps) => {
  const [showFilled, setShowFilled] = useState(false)
  const referenced = useMemo(() => referencedPromptVariables(content), [content])

  if (referenced.length === 0) return null

  const present = referenced.filter((id) => preview?.fields[id]?.value)
  const missing = referenced.filter((id) => !preview?.fields[id]?.value)
  // The same field must not read as blocking in the prompt and merely empty
  // here; one field, one severity, wherever it is shown.
  const blocks = (id: string) => (requiredVariableIds ?? []).includes(id)
  // Only an episode field can be filled by asking Podscan again. Offering the
  // button for a missing client bio would charge a credit to learn nothing.
  const refreshable = missing.filter((id) => LABELS.get(id)?.group === 'episode')

  return (
    <section aria-label="Field values for this podcast" className="rounded-lg border">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2">
        <p className="text-xs font-semibold">
          What this prompt receives{podcastName ? ` for ${podcastName}` : ''}
        </p>
        {!loading && preview && (
          <p className="text-[10px] tabular-nums text-muted-foreground">
            {present.length} of {referenced.length} filled
          </p>
        )}
      </header>

      {loading && <p className="px-3 py-2 text-[11px] text-muted-foreground">Reading this podcast…</p>}

      {/*
        A failed read is not an empty one. This used to fall through to "open
        this from a podcast", which named the wrong cause while a podcast was
        open, and the prompt simply went uncoloured with no explanation.
      */}
      {!loading && !preview && error && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <p className="text-[11px] text-amber-800">
            This podcast's values could not be read, so nothing below is marked filled or empty.
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded border px-2 py-0.5 text-[11px] hover:bg-muted"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {!loading && !preview && !error && (
        <p className="px-3 py-2 text-[11px] text-muted-foreground">
          Open this from a podcast to see its real values.
        </p>
      )}

      {!loading && preview && (
        <>
          {/*
            An empty field is not just a blank in the text — every instruction
            written around it now runs against "Not available". A prompt told
            to quote verbatim from a transcript that is missing does not skip
            the section; it invents one, and the quote reaches a host.
          */}
          {missing.length > 0 && (
            <div className="border-b bg-red-50 px-3 py-2 text-[11px] leading-4 text-red-900">
              <p className="font-semibold">
                {missing.length === 1
                  ? '1 field this prompt names is empty'
                  : `${missing.length} fields this prompt names are empty`}
              </p>
              <p className="mt-0.5">
                Instructions that quote, summarise or count from{' '}
                {missing.map((id) => `{{${id}}}`).join(', ')} will run against “Not
                available”. Say what to do when it is missing, or require the field
                below so the stage skips instead.
              </p>
              {refreshable.length > 0 && onRefreshEpisodes && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onRefreshEpisodes}
                    disabled={refreshing}
                    className="rounded border border-red-300 bg-background px-2 py-1 text-[11px] font-medium hover:bg-red-100 disabled:opacity-50"
                  >
                    {refreshing ? 'Asking Podscan…' : 'Fetch episodes from Podscan'}
                  </button>
                  <span className="text-[10px] leading-4">
                    1 credit, and only if Podscan answers. What it returns is stored
                    for every workspace, so nobody pays for this show again.
                  </span>
                </div>
              )}
            </div>
          )}
          {preview.transcript_episode_title && referenced.includes('episode_transcript') && (
            <p className="border-b bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
              The transcript is from “{preview.transcript_episode_title}”, not the latest episode —
              the latest has none yet. Anything quoted belongs to that earlier episode.
            </p>
          )}
          {/*
            The empty ones lead and the filled ones fold away. Colour in the
            prompt already says which is which, so re-listing all of them here
            put the same set on screen three times — once coloured, once here,
            once under Required fields — and buried the few that need a decision.
          */}
          <ul className="divide-y">
            {(showFilled ? referenced : missing).map((id) => {
              const field = preview.fields[id]
              const filled = Boolean(field?.value)
              const variable = LABELS.get(id)
              return (
                <li key={id} className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {filled
                      ? <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" aria-hidden="true" />
                      : <AlertTriangle
                        className={`h-3 w-3 shrink-0 ${blocks(id) ? 'text-red-600' : 'text-amber-600'}`}
                        aria-hidden="true"
                      />}
                    <span className="font-mono text-[11px] leading-4">{id}</span>
                    <span className="truncate text-[10px] text-muted-foreground">{variable?.label}</span>
                  </div>
                  <p className={`mt-1 text-[11px] leading-4 ${
                    filled ? 'text-foreground' : `italic ${blocks(id) ? 'text-red-700' : 'text-amber-700'}`
                  }`}>
                    {filled ? field!.value : explainEmpty(id)}
                    {!filled && blocks(id) && ' This stage is set to require it, so this podcast skips it.'}
                  </p>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
            {missing.length > 0 ? (
              <p className="text-[10px] leading-4 text-muted-foreground">
                Requiring a field below makes this podcast skip the stage instead of
                reading “Not available”.
              </p>
            ) : (
              <p className="text-[10px] leading-4 text-emerald-700">
                Every field this prompt names has a value.
              </p>
            )}
            {present.length > 0 && (
              <button
                type="button"
                onClick={() => setShowFilled((current) => !current)}
                aria-expanded={showFilled}
                className="shrink-0 rounded border px-2 py-0.5 text-[10px] hover:bg-muted"
              >
                {showFilled
                  ? 'Hide filled fields'
                  : `Show ${present.length} filled ${present.length === 1 ? 'field' : 'fields'}`}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
