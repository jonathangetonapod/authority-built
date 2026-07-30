import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { PROMPT_VARIABLES } from '@/lib/promptVariables'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  if (variable?.producedBy) return `Written by ${variable.producedBy}, which has not run`
  // A client field is empty for every podcast, not for this one: pointing at
  // the show would send someone to the wrong record.
  if (variable?.group === 'client') return 'Not on the client record'
  return 'This podcast has none'
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
  const referenced = useMemo(() => referencedPromptVariables(content), [content])
  /**
   * The field list opens in its own window.
   *
   * Inline it was eleven rows sitting between the prompt and Save, and the
   * editor became something you scrolled past to reach its own buttons. What
   * stays on the page is what you should not have to open anything to learn —
   * the count, and any warning — and the values are one click away.
   */
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [open, setOpen] = useState(true)
  const [shown, setShown] = useState<string | null>(null)

  if (referenced.length === 0) return null

  const present = referenced.filter((id) => preview?.fields[id]?.value)
  const missing = referenced.filter((id) => !preview?.fields[id]?.value)
  // The same field must not read as blocking in the prompt and merely empty
  // here; one field, one severity, wherever it is shown.
  const blocks = (id: string) => (requiredVariableIds ?? []).includes(id)
  // Only an episode field can be filled by asking Podscan again. Offering the
  // button for a missing client bio would charge a credit to learn nothing.
  const refreshable = missing.filter((id) => LABELS.get(id)?.group === 'episode')
  /** Every field by default; the gaps alone when asked for. */
  const listed = open ? referenced : missing

  return (
    <>
      <section aria-label="Field values for this podcast" className="rounded-lg border">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2">
        <p className="text-xs font-semibold">
          What this prompt receives{podcastName ? ` for ${podcastName}` : ''}
        </p>
        {!loading && preview && (
          <button
            type="button"
            onClick={() => setFieldsOpen(true)}
            className="rounded border px-2 py-0.5 text-[10px] tabular-nums hover:bg-muted"
          >
            {present.length} of {referenced.length} filled
            <span className="ml-1.5 underline">See the values</span>
          </button>
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
              <p>
                Anything this prompt asks you to quote or summarise from{' '}
                {missing.length === 1 ? 'that field' : 'those fields'} will be
                written from “Not available”.
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
                    1 credit, only if Podscan answers.
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
        </>
      )}
    </section>

      {/* Its own window, so the list cannot come between the prompt and Save. */}
      <Dialog open={fieldsOpen} onOpenChange={setFieldsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>What this prompt receives</DialogTitle>
            <DialogDescription>
              Read from stored data for {podcastName || 'this podcast'} by the same
              function the run uses. Click a field for its full value.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <>
              {missing.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOpen((current) => !current)}
                  aria-expanded={open}
                  className="self-start rounded border px-2 py-0.5 text-[10px] hover:bg-muted"
                >
                  {open ? `Only the ${missing.length} empty` : 'Show all fields'}
                </button>
              )}
              <div className="max-h-[60vh] overflow-y-auto rounded-lg border">
                <ul className="divide-y">
            {listed.map((id) => {
              const field = preview.fields[id]
              const filled = Boolean(field?.value)
              const variable = LABELS.get(id)
              const required = blocks(id)
              return (
                <li key={id} className="p-2">
                  <button
                    type="button"
                    onClick={() => setShown((current) => (current === id ? null : id))}
                    aria-expanded={shown === id}
                    className="flex w-full items-start gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-left hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2">
                        {filled
                          ? <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" aria-hidden="true" />
                          : <AlertTriangle
                            className={`h-3 w-3 shrink-0 ${required ? 'text-red-600' : 'text-amber-600'}`}
                            aria-hidden="true"
                          />}
                        <span className="font-mono text-[11px] leading-4">{id}</span>
                        <span className="truncate text-[10px] text-muted-foreground">{variable?.label}</span>
                        {required && (
                          <span className="ml-auto shrink-0 text-[10px] font-medium text-primary">
                            Required
                          </span>
                        )}
                      </span>
                      <p className={`mt-1 text-[11px] leading-4 ${
                        shown === id ? '' : 'line-clamp-1'
                      } ${filled ? 'text-foreground' : `italic ${required ? 'text-red-700' : 'text-amber-700'}`}`}>
                        {filled ? field!.value : explainEmpty(id)}
                        {!filled && required && ' — this podcast skips the stage'}
                      </p>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

              </div>
              <p className="text-[10px] leading-4 text-muted-foreground">
                Switch a field on in the prompt to skip this stage when it is empty,
                rather than run without it.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}