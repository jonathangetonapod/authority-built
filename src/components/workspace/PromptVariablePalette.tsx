import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PROMPT_VARIABLE_GROUPS, PROMPT_VARIABLES } from '@/lib/promptVariables'

interface PromptVariablePaletteProps {
  /** Inserts the token at the caret in the prompt being edited. */
  onInsert: (token: string) => void
  /** Fields the stage being edited writes itself, or that follow it. */
  omitVariableIds?: string[]
  /**
   * Which fields hold a value for the podcast being edited: id -> has a value.
   * Omit it where there is no podcast in context, so the list stays neutral
   * rather than reporting every field as empty.
   */
  availability?: Record<string, boolean> | null
}

/**
 * The browsable field list: every variable the run holds, grouped and
 * searchable, inserted at the caret on click.
 *
 * The editor used to print whichever variables the shipped default happened to
 * mention, so an owner rewriting a stage could not discover a field that was
 * already loaded and waiting. The registry is the list, and every stage is
 * filled from it.
 *
 * This is now the browse view behind a popover — typing `/` or `{{` in the
 * field is the fast path. See PromptVariableTextarea.
 */
export const PromptVariablePalette = ({
  onInsert,
  omitVariableIds,
  availability,
}: PromptVariablePaletteProps) => {
  const [query, setQuery] = useState('')
  const highlighting = Boolean(availability)

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return PROMPT_VARIABLE_GROUPS.map((group) => ({
      ...group,
      variables: PROMPT_VARIABLES.filter((variable) => (
        !(omitVariableIds ?? []).includes(variable.id)
        && variable.group === group.id
        && (needle === ''
          || variable.id.includes(needle)
          || variable.label.toLowerCase().includes(needle))
      )),
    })).filter((group) => group.variables.length > 0)
  }, [query, omitVariableIds])

  const total = groups.reduce((count, group) => count + group.variables.length, 0)

  return (
    <div className="rounded-lg">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search fields"
          aria-label="Search prompt variables"
          className="h-7 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
        />
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{total}</span>
      </div>
      <div className="max-h-56 space-y-3 overflow-y-auto p-3">
        {groups.length === 0 && (
          <p className="text-[11px] italic text-muted-foreground">No field matches “{query}”.</p>
        )}
        {groups.map((group) => (
          <div key={group.id}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            {group.id === 'run' && (
              <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                Each is written by a stage and readable by the stages after it. One used
                before its stage has run renders “Not available”.
              </p>
            )}
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {group.variables.map((variable) => {
                // Colour says it at a glance; the label says it to a screen
                // reader and to anyone who cannot separate the two hues.
                const filled = Boolean(availability?.[variable.id])
                const state = highlighting
                  ? (filled ? ' — has a value for this podcast' : ' — no value for this podcast')
                  : ''
                return (
                  <li key={variable.id}>
                    <button
                      type="button"
                      // The field must not lose focus before the token lands.
                      onMouseDown={(event) => event.preventDefault()}
                      title={(variable.producedBy
                        ? `${variable.label} — written by the ${variable.producedBy} stage`
                        : variable.label) + state}
                      aria-label={`Insert ${variable.label}${state}`}
                      onClick={() => onInsert(`{{${variable.id}}}`)}
                      className={`rounded border px-1.5 py-0.5 font-mono text-[11px] leading-4 transition-colors hover:border-violet-400 hover:bg-violet-50 ${
                        highlighting
                          ? (filled
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-red-200 bg-red-50 text-red-700')
                          : 'bg-background'
                      }`}
                    >
                      {variable.id}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="border-t px-3 py-2 text-[10px] leading-4 text-muted-foreground">
        Click a field to insert it. Anything else renders as “Not available”.
        {highlighting && (
          <>
            {' '}
            <span className="text-red-600">Red</span> fields have no value for this podcast.
          </>
        )}
      </p>
    </div>
  )
}
