import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Loader2, MessageSquareText, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { PromptVariablePalette } from './PromptVariablePalette'
import { RESEARCH_PROMPT_DEFAULTS_BY_ID, type ResearchPromptId } from '@/lib/researchPromptDefaults'
import {
  getClientSdrPrompts,
  resetClientSdrPrompt,
  setClientSdrPrompt,
} from '@/services/workspaceCampaigns'

interface PromptSpec {
  id: ResearchPromptId
  title: string
  detail: string
}

const PROMPT_GROUPS: Array<{ title: string; detail: string; prompts: PromptSpec[] }> = [
  {
    title: 'Inbox replies',
    detail: 'What the AI SDR does when a host responds.',
    prompts: [
      {
        id: 'inbox_reply',
        title: 'Reply instructions',
        detail: 'Classifies the reply and writes the response.',
      },
      {
        id: 'inbox_nudges',
        title: 'Follow-up nudges',
        detail: 'Guides the nudge plan staged with every reply and sent when a host goes quiet.',
      },
    ],
  },
  {
    title: 'Research and pitching',
    detail: 'How shows are researched and the opening pitch is written for this client.',
    prompts: [
      {
        id: 'podcast_research',
        title: 'Podcast research',
        detail: 'Show positioning, audience, format, and guest fit.',
      },
      {
        id: 'host_info',
        title: 'Host identification',
        detail: 'Finds every host and the booking contact.',
      },
      {
        id: 'guest_info',
        title: 'Guest verification',
        detail: 'Confirms the most recent guest from the episode.',
      },
      {
        id: 'find_topics',
        title: 'Topic proposal',
        detail: 'Chooses the angles pitched to this show.',
      },
      {
        id: 'write_email',
        title: 'Pitch email',
        detail: 'Writes the opening outreach email.',
      },
      {
        id: 'clean_email',
        title: 'Pitch cleanup',
        detail: 'Final pass over the drafted pitch before it is staged.',
      },
    ],
  },
]

interface ClientSdrPromptsCardProps {
  workspaceId: string
  clientId: string
  clientName: string
  canManage: boolean
}

export const ClientSdrPromptsCard = ({
  workspaceId,
  clientId,
  clientName,
  canManage,
}: ClientSdrPromptsCardProps) => {
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Partial<Record<ResearchPromptId, string>>>({})
  const [expanded, setExpanded] = useState<ResearchPromptId | null>(null)
  const fieldRefs = useRef<Partial<Record<ResearchPromptId, HTMLTextAreaElement | null>>>({})
  const promptsKey = ['client-sdr-prompts', workspaceId, clientId] as const

  // Click-to-insert at the caret, so building a prompt from fields reads like
  // typing rather than copying tokens out of a list.
  const insertVariable = (id: ResearchPromptId, token: string) => {
    const field = fieldRefs.current[id] ?? null
    const current = drafts[id] ?? ''
    const start = field?.selectionStart ?? current.length
    const end = field?.selectionEnd ?? current.length
    const before = current.slice(0, start)
    const after = current.slice(end)
    const lead = before && !/\s$/u.test(before) ? ' ' : ''
    const trail = after && !/^\s/u.test(after) ? ' ' : ''
    const inserted = `${lead}${token}${trail}`
    const caret = start + inserted.length
    setDrafts((currentDrafts) => ({ ...currentDrafts, [id]: `${before}${inserted}${after}` }))
    requestAnimationFrame(() => {
      field?.focus()
      field?.setSelectionRange(caret, caret)
    })
  }

  const promptsQuery = useQuery({
    queryKey: promptsKey,
    queryFn: () => getClientSdrPrompts(workspaceId, clientId),
    retry: false,
    staleTime: 60_000,
  })
  const overrides = promptsQuery.data ?? {}
  // Seed each editor once from the saved override, or the shipped default
  // when this client has none.
  useEffect(() => {
    if (!promptsQuery.data) return
    setDrafts((current) => {
      const next = { ...current }
      for (const prompt of PROMPT_GROUPS.flatMap((group) => group.prompts)) {
        if (next[prompt.id] === undefined) {
          next[prompt.id] = promptsQuery.data?.[prompt.id]?.content
            ?? RESEARCH_PROMPT_DEFAULTS_BY_ID[prompt.id].content
        }
      }
      return next
    })
  }, [promptsQuery.data])

  const saveMutation = useMutation({
    mutationFn: (input: { id: ResearchPromptId; content: string }) =>
      setClientSdrPrompt(workspaceId, clientId, input.id, input.content),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: promptsKey })
      toast.success(`Saved for ${clientName}.`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The prompt could not be saved.')
    },
  })
  const resetMutation = useMutation({
    mutationFn: (id: ResearchPromptId) => resetClientSdrPrompt(workspaceId, clientId, id),
    onSuccess: (_result, id) => {
      setDrafts((current) => ({ ...current, [id]: RESEARCH_PROMPT_DEFAULTS_BY_ID[id].content }))
      void queryClient.invalidateQueries({ queryKey: promptsKey })
      toast.success('Reset to the workspace default.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The prompt could not be reset.')
    },
  })

  return (
    <Card aria-labelledby="client-sdr-prompts-heading">
      <CardHeader>
        <CardTitle id="client-sdr-prompts-heading" className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-muted-foreground" />AI SDR prompts
        </CardTitle>
        <CardDescription>
          Every prompt {clientName}’s AI uses — inbox replies, follow-up nudges, research, and
          pitch writing. Saving one here overrides the workspace default for {clientName} only;
          untouched prompts follow the workspace house style.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {promptsQuery.isLoading ? (
          <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Loading prompts…
          </div>
        ) : (
          PROMPT_GROUPS.map((group) => (
            <section key={group.title} className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">{group.title}</h3>
                <p className="text-xs text-muted-foreground">{group.detail}</p>
              </div>
              {group.prompts.map((prompt) => {
                const saved = overrides[prompt.id]?.content
                const fallback = RESEARCH_PROMPT_DEFAULTS_BY_ID[prompt.id].content
                const value = drafts[prompt.id] ?? saved ?? fallback
                const dirty = value !== (saved ?? fallback)
                const busy = saveMutation.isPending || resetMutation.isPending
                const open = expanded === prompt.id
                return (
                  <div key={prompt.id} className="rounded-xl border">
                    <div className="flex flex-wrap items-start justify-between gap-2 p-3.5">
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setExpanded(open ? null : prompt.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                          {prompt.title}
                          {saved
                            ? <Badge variant="secondary" className="text-[10px]">Custom for {clientName.split(' ')[0]}</Badge>
                            : <Badge variant="outline" className="text-[10px] text-muted-foreground">Workspace default</Badge>}
                          {dirty && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-800">Unsaved</Badge>}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{prompt.detail}</span>
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        {canManage && saved && (
                          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => resetMutation.mutate(prompt.id)}>
                            <RotateCcw className="mr-2 h-3.5 w-3.5" />Reset
                          </Button>
                        )}
                        {canManage && (
                          <Button type="button" size="sm" disabled={!dirty || busy} onClick={() => saveMutation.mutate({ id: prompt.id, content: value })}>
                            {saveMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Save
                          </Button>
                        )}
                        <Button type="button" size="sm" variant="ghost" onClick={() => setExpanded(open ? null : prompt.id)}>
                          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          <span className="sr-only">{open ? 'Hide' : 'Edit'} {prompt.title}</span>
                        </Button>
                      </div>
                    </div>
                    {open && (
                      <div className="space-y-3 border-t p-3.5">
                        <PromptVariablePalette
                          disabled={!canManage}
                          onInsert={(token) => insertVariable(prompt.id, token)}
                        />
                        <Textarea
                          ref={(node) => { fieldRefs.current[prompt.id] = node }}
                          value={value}
                          readOnly={!canManage}
                          aria-label={`${prompt.title} for ${clientName}`}
                          onChange={(event) => setDrafts((current) => ({ ...current, [prompt.id]: event.target.value }))}
                          className="min-h-52 font-mono text-xs leading-5"
                          maxLength={20_000}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          ))
        )}
      </CardContent>
    </Card>
  )
}
