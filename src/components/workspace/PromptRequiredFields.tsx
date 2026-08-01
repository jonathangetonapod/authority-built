import { useEffect, useMemo, useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { PROMPT_VARIABLES } from '@/lib/promptVariables'
import { referencedPromptVariables } from '@/lib/promptVariableMenu'

interface PromptRequiredFieldsProps {
  /** The prompt text as it will be saved; its {{tokens}} are the field list. */
  content: string
  /** Field ids currently required for this stage. */
  required: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  /** Shown when this stage inherits its requirements from the workspace. */
  inheritedNote?: string
}

/**
 * Which of a prompt's fields the stage refuses to run without.
 *
 * Only the fields the prompt actually references are offered: requiring a
 * field the prompt never names would block runs to protect a value nothing
 * reads. Off is the default, so a stage behaves exactly as it did until an
 * owner deliberately turns something on.
 */
export const PromptRequiredFields = ({
  content,
  required,
  onChange,
  disabled,
  inheritedNote,
}: PromptRequiredFieldsProps) => {
  const fields = useMemo(() => {
    const referenced = new Set(referencedPromptVariables(content))
    return PROMPT_VARIABLES.filter((variable) => referenced.has(variable.id))
  }, [content])

  const requiredSet = useMemo(() => new Set(required), [required])
  /**
   * What the switches show, which leads what has been saved.
   *
   * Cleared whenever the saved set arrives, so a rejected save snaps back to
   * the truth rather than leaving the control lying about a change that did
   * not land.
   */
  const [pending, setPending] = useState<Set<string> | null>(null)
  useEffect(() => { setPending(null) }, [required])
  const shown = pending ?? requiredSet

  if (fields.length === 0) {
    return (
      <p className="text-[11px] leading-4 text-muted-foreground">
        This prompt names no fields, so there is nothing it can require.
      </p>
    )
  }

  const toggle = (id: string, on: boolean) => {
    const next = new Set(shown)
    if (on) next.add(id)
    else next.delete(id)
    // The switch moves now and the save follows. Every flip is a round trip,
    // and waiting for it meant a control that lagged behind the finger and,
    // on a slow response, appeared not to have worked at all.
    setPending(next)
    // Registry order, so the saved set reads the way the list is drawn.
    onChange(PROMPT_VARIABLES.filter((variable) => next.has(variable.id)).map((variable) => variable.id))
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-semibold">Required fields</p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
          A podcast missing a required field does not run this stage, and is not
          charged for it. Everything else falls back to “Not available”.
        </p>
        {inheritedNote && (
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{inheritedNote}</p>
        )}
      </div>
      <ul className="divide-y rounded-lg border">
        {fields.map((variable) => {
          const on = shown.has(variable.id)
          return (
            <li key={variable.id} className="flex items-center gap-3 px-3 py-1.5">
              <Switch
                checked={on}
                disabled={disabled}
                aria-label={`Require ${variable.label}`}
                onCheckedChange={(next) => toggle(variable.id, next === true)}
              />
              {/* One line per field. The id and its plain name were stacked,
                  which doubled the height of a list whose whole job is to be
                  scanned against the prompt beside it. */}
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="truncate font-mono text-[11px] leading-5">{variable.id}</span>
                <span className="truncate text-[10px] leading-5 text-muted-foreground">{variable.label}</span>
              </span>
              <span className={`shrink-0 text-[10px] font-medium ${on ? 'text-violet-700' : 'text-muted-foreground'}`}>
                {on ? 'Required' : 'Optional'}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
