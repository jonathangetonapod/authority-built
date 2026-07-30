import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Braces } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { PROMPT_VARIABLES, type PromptVariable } from '@/lib/promptVariables'
import {
  applyVariableTrigger,
  detectVariableTrigger,
  filterPromptVariables,
  groupPromptVariableMatches,
  measureCaret,
  spliceAtCaret,
  splitOnMatch,
  splitPromptTokens,
  strayTriggerHints,
  type VariableTrigger,
} from '@/lib/promptVariableMenu'
import { PromptVariablePalette } from './PromptVariablePalette'

interface PromptVariableTextareaProps {
  id?: string
  value: string
  onChange: (next: string) => void
  /** Names the field for assistive technology and for the tests. */
  ariaLabel: string
  disabled?: boolean
  readOnly?: boolean
  className?: string
  maxLength?: number
  /** Fields earlier stages declare they return, offered alongside the registry. */
  extraVariables?: PromptVariable[]
  /** Fields this stage writes itself, or that are written after it. */
  omitVariableIds?: string[]
  /**
   * Which fields hold a value for the podcast being edited: id -> has a value.
   * Omit it where there is no podcast in context — with nothing to report, the
   * prompt is left uncoloured rather than painted as if every field were empty.
   */
  availability?: Record<string, boolean> | null
}

/**
 * The prompt field, with the registry reachable from inside it.
 *
 * Typing `/` at the start of a word or `{{` anywhere opens the field list at
 * the caret; the full grouped list stays one click away for browsing. What used
 * to be ~290px of permanently open chips above a 208px textarea is now a single
 * line of hint text.
 */
export const PromptVariableTextarea = ({
  id,
  value,
  onChange,
  ariaLabel,
  disabled,
  readOnly,
  className,
  maxLength,
  extraVariables,
  omitVariableIds,
  availability,
}: PromptVariableTextareaProps) => {
  const fieldRef = useRef<HTMLTextAreaElement | null>(null)
  const highlightRef = useRef<HTMLDivElement | null>(null)
  const [trigger, setTrigger] = useState<VariableTrigger | null>(null)
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const [active, setActive] = useState(0)
  const [caretPoint, setCaretPoint] = useState({ top: 0, left: 0 })
  const [browsing, setBrowsing] = useState(false)

  const editable = !disabled && !readOnly
  const omitted = useMemo(() => new Set(omitVariableIds ?? []), [omitVariableIds])
  const matches = useMemo(
    () => (trigger
      ? filterPromptVariables(trigger.query, undefined, extraVariables ?? [])
        .filter((variable) => !omitted.has(variable.id))
      : []),
    [trigger, extraVariables, omitted],
  )
  // Ranking decides the order the arrow keys walk; the groups are headings over
  // that order, so what the eye scans and what Enter picks stay the same list.
  const groups = useMemo(() => groupPromptVariableMatches(matches), [matches])
  const walkOrder = useMemo(() => groups.flatMap((group) => group.variables), [groups])
  const open = Boolean(trigger) && matches.length > 0 && editable

  // A stage output an upstream prompt declares is as real a token as a
  // registry field, so the overlay has to recognize both or it would leave the
  // declared ones looking like prose.
  const knownIds = useMemo(() => {
    const ids = new Set(PROMPT_VARIABLES.map((variable) => variable.id))
    for (const variable of extraVariables ?? []) ids.add(variable.id)
    return ids
  }, [extraVariables])

  const highlighting = Boolean(availability)
  const segments = useMemo(
    () => (highlighting ? splitPromptTokens(value, (id) => knownIds.has(id)) : []),
    [highlighting, value, knownIds],
  )
  const strays = useMemo(() => (editable ? strayTriggerHints(value) : []), [editable, value])

  const syncTrigger = (field: HTMLTextAreaElement | null) => {
    if (!field || !editable) return
    const next = detectVariableTrigger(field.value, field.selectionStart ?? 0)
    setTrigger(next)
    if (!next || next.start !== dismissedAt) setDismissedAt(null)
    setActive(0)
  }

  useLayoutEffect(() => {
    const field = fieldRef.current
    if (!open || !field || !trigger) return
    setCaretPoint(measureCaret(field, trigger.start))
  }, [open, trigger])

  const focusCaret = (caret: number) => {
    requestAnimationFrame(() => {
      const field = fieldRef.current
      field?.focus()
      field?.setSelectionRange(caret, caret)
    })
  }

  const choose = (variableId: string) => {
    const field = fieldRef.current
    if (!field || !trigger) return
    const result = applyVariableTrigger(field.value, trigger, field.selectionStart ?? 0, variableId)
    setTrigger(null)
    onChange(result.next)
    focusCaret(result.caret)
  }

  /** The browse popover has no trigger text to replace, so it pads instead. */
  const insertFromPalette = (token: string) => {
    const field = fieldRef.current
    const start = field?.selectionStart ?? value.length
    const end = field?.selectionEnd ?? value.length
    const result = spliceAtCaret(value, start, end, token)
    setBrowsing(false)
    onChange(result.next)
    focusCaret(result.caret)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((current) => (current + 1) % walkOrder.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => (current - 1 + walkOrder.length) % walkOrder.length)
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      choose(walkOrder[active].id)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setDismissedAt(trigger?.start ?? null)
      setTrigger(null)
    }
  }

  const optionId = (variableId: string) => `${id ?? ariaLabel}-field-${variableId}`

  /**
   * A row can match on its description alone, so show where it matched — an id
   * that looks unrelated to what was typed is otherwise unexplained.
   */
  const marked = (text: string) => splitOnMatch(text, trigger?.query ?? '').map((segment, index) => (
    segment.match
      ? <mark key={index} className="bg-transparent font-semibold text-violet-700">{segment.text}</mark>
      : <span key={index}>{segment.text}</span>
  ))
  const activeId = open ? optionId(walkOrder[active]?.id) : undefined

  // The whole registry is in the menu now, so the active row can be well below
  // the fold. Keep it in view as the arrows walk past a group heading.
  useLayoutEffect(() => {
    if (!open || !activeId) return
    document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [open, activeId])

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-[11px] leading-4 text-muted-foreground">
          Type <code className="rounded bg-muted px-1 py-px font-mono text-[10px]">/</code> or{' '}
          <code className="rounded bg-muted px-1 py-px font-mono text-[10px]">{'{{'}</code> to insert a field.
          {highlighting && (
            <>
              {' '}
              <span className="text-red-600">Red</span> fields have no value for this podcast.
            </>
          )}
        </p>
        <Popover open={browsing} onOpenChange={setBrowsing}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!editable}
              className="h-6 gap-1.5 px-2 text-[11px] text-muted-foreground"
            >
              <Braces className="h-3 w-3" aria-hidden="true" />
              Browse {PROMPT_VARIABLES.length} fields
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[22rem] p-0">
            <PromptVariablePalette
              onInsert={insertFromPalette}
              omitVariableIds={omitVariableIds}
              availability={availability}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="relative">
        {/*
          The coloured copy sits behind a textarea whose own text is
          transparent, so the caret, selection and scrolling stay the
          browser's. Both layers carry the same className and the same box —
          padding, border width, font and leading — because any difference
          between them shows up as text drifting off its own highlight.
        */}
        {highlighting && (
          <div
            ref={highlightRef}
            aria-hidden="true"
            className={cn(
              // select-none as well as aria-hidden: the layer is a copy of the
              // prompt, and without it selecting the page yields the text twice.
              'pointer-events-none select-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent px-3 py-2 text-sm',
              className,
            )}
          >
            {segments.map((segment, index) => (
              segment.variableId
                ? (
                  <span
                    key={index}
                    // Colour, background and underline only. Anything that
                    // changes advance width — weight, size, letter-spacing —
                    // would slide this layer out of step with the caret and
                    // selection, which still come from the textarea.
                    className={availability?.[segment.variableId]
                      ? 'rounded-[3px] bg-emerald-50 text-emerald-700'
                      : 'rounded-[3px] bg-red-50 text-red-600 underline decoration-red-400 decoration-dotted underline-offset-2'}
                  >
                    {segment.text}
                  </span>
                )
                : <span key={index}>{segment.text}</span>
            ))}
            {/* A trailing newline needs something after it or the box ends early. */}
            {'\n'}
          </div>
        )}
        <Textarea
          id={id}
          ref={fieldRef}
          value={value}
          aria-label={ariaLabel}
          disabled={disabled}
          readOnly={readOnly}
          // The highlight classes go last: cn merges with tailwind-merge, and
          // callers pass bg-background, which would otherwise paint over the
          // coloured layer and hide the whole thing.
          className={`${className ?? ''}${highlighting ? ' relative bg-transparent text-transparent caret-foreground selection:bg-violet-300/40' : ''}`}
          maxLength={maxLength}
          onScroll={(event) => {
            const layer = highlightRef.current
            if (!layer) return
            layer.scrollTop = event.currentTarget.scrollTop
            layer.scrollLeft = event.currentTarget.scrollLeft
          }}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={open ? `${id ?? ariaLabel}-field-menu` : undefined}
          aria-activedescendant={activeId}
          onChange={(event) => {
            onChange(event.target.value)
            syncTrigger(event.target)
          }}
          onSelect={(event) => syncTrigger(event.currentTarget)}
          onKeyDown={handleKeyDown}
          onBlur={() => setTrigger(null)}
        />
        {open && (
          <div
            style={{ top: caretPoint.top + 22, left: Math.max(0, Math.min(caretPoint.left, 160)) }}
            className="absolute z-50 w-[22rem] overflow-hidden rounded-lg border bg-popover shadow-md"
          >
          <div
            id={`${id ?? ariaLabel}-field-menu`}
            role="listbox"
            aria-label="Matching fields"
            className="max-h-72 overflow-y-auto p-1"
          >
            {groups.map((group) => (
              <div key={group.id} role="group" aria-label={group.label}>
                <p
                  aria-hidden="true"
                  className="sticky top-0 z-10 bg-popover px-2 pb-1 pt-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {group.label}
                  {group.id === 'run' && (
                    <span className="ml-1.5 font-normal normal-case tracking-normal">
                      written by one stage, readable by the stages after it
                    </span>
                  )}
                </p>
                {group.variables.map((variable) => {
                  const index = walkOrder.indexOf(variable)
                  return (
                    <button
                      key={variable.id}
                      type="button"
                      id={optionId(variable.id)}
                      role="option"
                      aria-selected={index === active}
                      // The field must not lose focus before the token lands.
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(variable.id)}
                      className={`block w-full rounded px-2 py-1 text-left transition-colors ${index === active ? 'bg-violet-50' : ''}`}
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="block flex-1 font-mono text-[11px] leading-4">
                          {marked(variable.id)}
                        </span>
                        {/*
                          On the marker rather than on the id: the id already
                          carries the violet highlight showing where the search
                          matched, and two colours on one word read as neither.
                        */}
                        {highlighting && (
                          <span
                            className={`shrink-0 text-[9px] leading-4 ${
                              availability?.[variable.id] ? 'text-emerald-600' : 'text-red-600'
                            }`}
                          >
                            {availability?.[variable.id] ? '● has a value' : '● empty'}
                          </span>
                        )}
                      </span>
                      <span className="block text-[10px] leading-4 text-muted-foreground">
                        {marked(variable.producedBy
                          ? `${variable.label} — from the ${variable.producedBy} stage`
                          : variable.label)}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          {/*
            Outside the listbox: a row that is not an option does not belong
            among the options.
          */}
          <p className="border-t px-2 py-1 text-[10px] leading-4 text-muted-foreground">
            {matches.length === PROMPT_VARIABLES.length
              ? `All ${PROMPT_VARIABLES.length} fields`
              : `${matches.length} of ${PROMPT_VARIABLES.length} fields`}
          </p>
          </div>
        )}
      </div>

      {/*
        Reported, not corrected. What looks like litter is sometimes meant, and
        the operator is the one who knows which.
      */}
      {strays.map((hint) => (
        <p key={hint} className="text-[11px] leading-4 text-amber-700">{hint}</p>
      ))}
    </div>
  )
}
