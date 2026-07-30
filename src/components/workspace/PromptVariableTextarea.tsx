import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  /**
   * Fields this stage refuses to run without. An empty one of these stops the
   * run; an empty optional one only renders "Not available", which a prompt
   * can be written to absorb. They are not the same warning.
   */
  requiredVariableIds?: string[]
  /**
   * Turns the requirement on or off from the token itself. Given here so the
   * switch sits on the variable being written about, rather than in a list
   * somewhere under the field.
   */
  onToggleRequired?: (variableId: string, required: boolean) => void
  requirementsDisabled?: boolean
}

/**
 * A switch built out of the characters the token was not using.
 *
 * The coloured layer has to stay character-for-character with the textarea, so
 * a control in the text can only occupy space the text already had. A token
 * has four such characters — the "{{" and the "}}" — and they are worth more
 * as one switch than as two pairs of braces, so the switch takes all of them
 * and stands where the opening brace was.
 *
 * widthCh is measured, not guessed: whatever the token spends on characters
 * that are not the field name is what the switch is given, so "{{ name }}"
 * yields a wider switch and the total stays exact either way. Everything after
 * the token lands on the column the textarea put it on; only a caret placed
 * inside the name itself sits left of where it reads.
 */
const RequiredToggle = ({
  variableId,
  required,
  disabled,
  widthCh,
  onToggle,
}: {
  variableId: string
  required: boolean
  disabled?: boolean
  widthCh: number
  onToggle: (variableId: string, required: boolean) => void
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={required}
    aria-label={`Require ${variableId}`}
    disabled={disabled}
    title={required
      ? `${variableId} is required — this podcast skips the stage when it is empty`
      : `Require ${variableId}`}
    // The layer ignores pointers so the textarea keeps the caret; the switch
    // is the one thing on it that does not.
    onMouseDown={(event) => event.preventDefault()}
    onClick={() => onToggle(variableId, !required)}
    // The gap comes out of the switch, not on top of it: the chip has to
    // total exactly the characters it replaced, so a margin that added width
    // would push every character after it off its column. 0.15 in front, 0.45
    // behind, and the switch takes what is left.
    style={{
      width: `${widthCh - 0.6}ch`,
      marginLeft: '0.15ch',
      marginRight: '0.45ch',
    }}
    // before: an invisible pad that grows the target past the visible switch
    // without adding a pixel to the box.
    className={`pointer-events-auto relative inline-block h-[1.15em] shrink-0 cursor-pointer rounded-full border align-middle transition-colors before:absolute before:-inset-2 before:content-[''] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 ${
      required
        ? 'border-primary bg-primary'
        : 'border-muted-foreground/30 bg-muted-foreground/15'
    }`}
  >
    {/* Travel the width of the track, so the thing reads as a switch rather
        than a dot: at four characters wide there is room to see it move. */}
    <span
      className={`absolute top-1/2 block h-[0.8em] w-[0.8em] -translate-y-1/2 rounded-full shadow-sm transition-all ${
        required
          ? 'left-[calc(100%-0.95em)] bg-background'
          : 'left-[0.13em] bg-background'
      }`}
    />
  </button>
)

type FieldState = 'filled' | 'degrades' | 'blocks'

// whitespace-nowrap because the switch is an inline-block, and an inline-block
// is somewhere a line may break. "{{itunes_rating}}" has no break in it as far
// as the textarea is concerned, so a layer that broke between the switch and
// the name put the two on different lines and took the text with it.
//
// The outline is a ring rather than a border: a border on an inline element is
// advance width, and a pixel of that on every token is a pixel the textarea
// underneath never spent. A ring is a shadow, and shadows cost no space.
const TOKEN_BASE = 'whitespace-nowrap rounded ring-1'

const TOKEN_STYLES: Record<FieldState, string> = {
  filled: `${TOKEN_BASE} bg-emerald-50/70 text-emerald-700 ring-emerald-200`,
  degrades: `${TOKEN_BASE} bg-amber-50/70 text-amber-700 ring-amber-300 underline decoration-amber-400 decoration-dotted underline-offset-2`,
  blocks: `${TOKEN_BASE} bg-red-50 text-red-700 ring-red-300 underline decoration-red-400 decoration-dotted underline-offset-2`,
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
  requiredVariableIds,
  onToggleRequired,
  requirementsDisabled,
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

  const required = useMemo(() => new Set(requiredVariableIds ?? []), [requiredVariableIds])
  /**
   * What the token is worth telling you about, which is not the same question
   * as whether the field is required.
   *
   * Requiredness is a setting and applies to a field that has a value today —
   * you require it so a podcast that lacks it skips the stage. Reading the
   * switch off this made it dead on every filled field: 'filled' is returned
   * before requiredness is ever consulted, so the switch could not turn on for
   * the one case where nothing looks wrong yet.
   */
  const fieldState = useCallback((variableId: string): FieldState => {
    if (availability?.[variableId]) return 'filled'
    return required.has(variableId) ? 'blocks' : 'degrades'
  }, [availability, required])
  const blocking = useMemo(
    () => (highlighting
      ? [...new Set(segments.map((segment) => segment.variableId).filter((id): id is string => Boolean(id)))]
        .filter((id) => fieldState(id) === 'blocks')
      : []),
    [highlighting, segments, fieldState],
  )

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
              <span className="text-amber-700">Amber</span> fields are empty and reach the
              model as “Not available”.
              {blocking.length > 0 && (
                <>
                  {' '}
                  <span className="text-red-700">Red</span> ones are required, so this podcast
                  skips the stage entirely.
                </>
              )}
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
            className={cn(
              // Each piece of text hides itself from the accessibility tree
              // rather than the layer hiding all of it: the switches on this
              // layer are real controls, and aria-hidden on the whole thing
              // put them somewhere a screen reader could never reach.
              // select-none because the layer copies the prompt, and without
              // it selecting the page yields the text twice.
              'pointer-events-none select-none absolute inset-0 z-10 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent bg-transparent px-3 py-2 text-sm',
              className,
              'bg-transparent',
              // The textarea dims itself when disabled, but the text you can
              // actually see is this layer's, so without matching it a saving
              // field looks exactly like an editable one.
              disabled && 'opacity-50',
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
                    className={TOKEN_STYLES[fieldState(segment.variableId)]}
                  >
                    {onToggleRequired
                      ? (
                        <>
                          {/*
                            The switch stands exactly where "{{" is typed, and
                            is exactly that wide: 2ch of a monospace font is
                            two characters, so the text after it still sits on
                            the column the textarea put it in. Anything wider
                            and the caret would part company with its own text.
                          */}
                          <RequiredToggle
                            variableId={segment.variableId}
                            required={required.has(segment.variableId)}
                            disabled={requirementsDisabled}
                            // Every character the token does not spend on the
                            // field name, so the chip totals what it replaced.
                            widthCh={segment.text.length - segment.variableId.length}
                            onToggle={onToggleRequired}
                          />
                          <span aria-hidden="true">{segment.variableId}</span>
                        </>
                      )
                      : <span aria-hidden="true">{segment.text}</span>}
                  </span>
                )
                : <span key={index} aria-hidden="true">{segment.text}</span>
            ))}
            {/* A trailing newline needs something after it or the box ends early. */}
            <span aria-hidden="true">{'\n'}</span>
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
          className={`${className ?? ''}${highlighting ? ' text-transparent caret-foreground selection:bg-violet-300/40' : ''}`}
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
                        {highlighting && (() => {
                          const state = fieldState(variable.id)
                          return (
                            <span
                              className={`shrink-0 text-[9px] leading-4 ${{
                                filled: 'text-emerald-600',
                                degrades: 'text-amber-700',
                                blocks: 'text-red-700',
                              }[state]}`}
                            >
                              {{
                                filled: '● has a value',
                                degrades: '● empty',
                                blocks: '● empty — required, blocks the run',
                              }[state]}
                            </span>
                          )
                        })()}
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
