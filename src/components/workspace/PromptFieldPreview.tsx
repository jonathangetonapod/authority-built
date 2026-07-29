import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { PROMPT_VARIABLES } from '@/lib/promptVariables'
import { referencedPromptVariables } from '@/lib/promptVariableMenu'
import type { PromptPreview } from '@/services/clientShortlist'

interface PromptFieldPreviewProps {
  /** The prompt being edited; its {{tokens}} decide what is shown. */
  content: string
  preview: PromptPreview | null
  loading?: boolean
  podcastName?: string | null
}

const LABELS = new Map(PROMPT_VARIABLES.map((variable) => [variable.id, variable]))

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
  podcastName,
}: PromptFieldPreviewProps) => {
  const referenced = useMemo(() => referencedPromptVariables(content), [content])

  if (referenced.length === 0) return null

  const present = referenced.filter((id) => preview?.fields[id]?.value)
  const missing = referenced.filter((id) => !preview?.fields[id]?.value)

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

      {!loading && !preview && (
        <p className="px-3 py-2 text-[11px] text-muted-foreground">
          Open this from a podcast to see its real values.
        </p>
      )}

      {!loading && preview && (
        <>
          {preview.transcript_episode_title && referenced.includes('episode_transcript') && (
            <p className="border-b bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
              The transcript is from “{preview.transcript_episode_title}”, not the latest episode —
              the latest has none yet. Anything quoted belongs to that earlier episode.
            </p>
          )}
          <ul className="divide-y">
            {referenced.map((id) => {
              const field = preview.fields[id]
              const filled = Boolean(field?.value)
              const variable = LABELS.get(id)
              return (
                <li key={id} className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {filled
                      ? <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" aria-hidden="true" />
                      : <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" aria-hidden="true" />}
                    <span className="font-mono text-[11px] leading-4">{id}</span>
                    <span className="truncate text-[10px] text-muted-foreground">{variable?.label}</span>
                  </div>
                  <p className={`mt-1 text-[11px] leading-4 ${filled ? 'text-foreground' : 'italic text-amber-700'}`}>
                    {filled
                      ? field!.value
                      : preview.researched
                        ? 'Not available — the model is told exactly that'
                        : 'Not available yet — this one is written by an earlier stage'}
                  </p>
                </li>
              )
            })}
          </ul>
          {missing.length > 0 && (
            <p className="border-t px-3 py-2 text-[10px] leading-4 text-muted-foreground">
              Requiring a field below makes this podcast skip the stage instead of
              reading “Not available”.
            </p>
          )}
        </>
      )}
    </section>
  )
}
