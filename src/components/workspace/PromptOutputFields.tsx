import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isRegistryVariable } from '@/lib/promptVariableMenu'
import type { PromptOutputField } from '@/services/workspaceCampaigns'

interface PromptOutputFieldsProps {
  fields: PromptOutputField[]
  onChange: (next: PromptOutputField[]) => void
  disabled?: boolean
  /** Stages that run after this one, named so the payoff is concrete. */
  laterStageLabel?: string | null
}

const ID_PATTERN = /^[a-z][a-z0-9_]{1,47}$/u

/**
 * The fields a stage returns, named here rather than by us.
 *
 * A stage that declares nothing keeps writing its single blob, which is what
 * every stage did before this existed — so the empty state is the old
 * behaviour, not a missing configuration.
 */
export const PromptOutputFields = ({
  fields,
  onChange,
  disabled,
  laterStageLabel,
}: PromptOutputFieldsProps) => {
  const [draftId, setDraftId] = useState('')

  const invalid = draftId.trim() !== '' && !ID_PATTERN.test(draftId.trim())
  const taken = ID_PATTERN.test(draftId.trim())
    && (isRegistryVariable(draftId.trim()) || fields.some((field) => field.id === draftId.trim()))

  const add = () => {
    const id = draftId.trim()
    if (!ID_PATTERN.test(id) || taken) return
    onChange([...fields, { id, label: id, description: '', type: 'text' }])
    setDraftId('')
  }

  const update = (id: string, patch: Partial<PromptOutputField>) => {
    onChange(fields.map((field) => (field.id === id ? { ...field, ...patch } : field)))
  }

  return (
    <section aria-label="Fields this stage returns" className="rounded-lg border">
      <header className="border-b bg-muted/20 px-3 py-2">
        <p className="text-xs font-semibold">Fields this stage returns</p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
          Name a field and this stage is asked to return it. Each one becomes a
          variable {laterStageLabel ? `${laterStageLabel} and the stages after it can use` : 'later stages can use'},
          like any other field. Leave this empty and the stage writes one block of
          text, as it always has.
        </p>
      </header>

      {fields.length > 0 && (
        <ul className="divide-y">
          {fields.map((field) => (
            <li key={field.id} className="space-y-2 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <code className="font-mono text-[11px] font-semibold">{`{{${field.id}}}`}</code>
                <select
                  value={field.type}
                  disabled={disabled}
                  aria-label={`Type of ${field.id}`}
                  onChange={(event) => update(field.id, { type: event.target.value === 'list' ? 'list' : 'text' })}
                  className="ml-auto rounded border bg-background px-1.5 py-0.5 text-[11px]"
                >
                  <option value="text">Text</option>
                  <option value="list">List</option>
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  aria-label={`Remove ${field.id}`}
                  onClick={() => onChange(fields.filter((entry) => entry.id !== field.id))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Input
                value={field.description}
                disabled={disabled}
                aria-label={`What ${field.id} should contain`}
                placeholder="What this field should contain — the model is told this verbatim"
                onChange={(event) => update(field.id, { description: event.target.value.slice(0, 500) })}
                className="h-7 text-[11px]"
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-start gap-2 border-t px-3 py-2">
        <div className="flex-1">
          <Input
            value={draftId}
            disabled={disabled}
            aria-label="New field name"
            placeholder="host_style"
            onChange={(event) => setDraftId(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add() } }}
            className="h-7 font-mono text-[11px]"
          />
          {invalid && (
            <p className="mt-1 text-[10px] text-amber-700">
              Lowercase letters, numbers and underscores, starting with a letter.
            </p>
          )}
          {taken && (
            <p className="mt-1 text-[10px] text-amber-700">
              {isRegistryVariable(draftId.trim())
                ? 'The run already provides that field — pick another name so a written value cannot impersonate it.'
                : 'This stage already returns that field.'}
            </p>
          )}
        </div>
        <Button type="button" size="sm" disabled={disabled || !ID_PATTERN.test(draftId.trim()) || taken} onClick={add}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />Add field
        </Button>
      </div>
    </section>
  )
}
