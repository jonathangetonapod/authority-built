import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Braces } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { PROMPT_VARIABLES } from '@/lib/promptVariables'
import {
  applyVariableTrigger,
  detectVariableTrigger,
  filterPromptVariables,
  measureCaret,
  spliceAtCaret,
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
}

const MENU_LIMIT = 8

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
}: PromptVariableTextareaProps) => {
  const fieldRef = useRef<HTMLTextAreaElement | null>(null)
  const [trigger, setTrigger] = useState<VariableTrigger | null>(null)
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const [active, setActive] = useState(0)
  const [caretPoint, setCaretPoint] = useState({ top: 0, left: 0 })
  const [browsing, setBrowsing] = useState(false)

  const editable = !disabled && !readOnly
  const matches = useMemo(
    () => (trigger ? filterPromptVariables(trigger.query, MENU_LIMIT) : []),
    [trigger],
  )
  const open = Boolean(trigger) && matches.length > 0 && editable

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
      setActive((current) => (current + 1) % matches.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => (current - 1 + matches.length) % matches.length)
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      choose(matches[active].id)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setDismissedAt(trigger?.start ?? null)
      setTrigger(null)
    }
  }

  const activeId = open ? `${id ?? ariaLabel}-field-${matches[active]?.id}` : undefined

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-[11px] leading-4 text-muted-foreground">
          Type <code className="rounded bg-muted px-1 py-px font-mono text-[10px]">/</code> or{' '}
          <code className="rounded bg-muted px-1 py-px font-mono text-[10px]">{'{{'}</code> to insert a field.
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
            <PromptVariablePalette onInsert={insertFromPalette} />
          </PopoverContent>
        </Popover>
      </div>

      <div className="relative">
        <Textarea
          id={id}
          ref={fieldRef}
          value={value}
          aria-label={ariaLabel}
          disabled={disabled}
          readOnly={readOnly}
          className={className}
          maxLength={maxLength}
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
          <ul
            id={`${id ?? ariaLabel}-field-menu`}
            role="listbox"
            aria-label="Matching fields"
            style={{ top: caretPoint.top + 22, left: Math.max(0, Math.min(caretPoint.left, 160)) }}
            className="absolute z-50 max-h-60 w-[19rem] overflow-y-auto rounded-lg border bg-popover p-1 shadow-md"
          >
            {matches.map((variable, index) => (
              <li key={variable.id}>
                <button
                  type="button"
                  id={`${id ?? ariaLabel}-field-${variable.id}`}
                  role="option"
                  aria-selected={index === active}
                  // The field must not lose focus before the token lands.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(variable.id)}
                  className={`w-full rounded px-2 py-1.5 text-left transition-colors ${index === active ? 'bg-violet-50' : ''}`}
                >
                  <span className="block font-mono text-[11px] leading-4">{variable.id}</span>
                  <span className="block text-[10px] leading-4 text-muted-foreground">
                    {variable.producedBy
                      ? `${variable.label} — written by the ${variable.producedBy} stage`
                      : variable.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
