import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, MessageSquareText, Pencil, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PromptVariableTextarea } from './PromptVariableTextarea'
import { PromptRequiredFields } from './PromptRequiredFields'
import { unavailableVariableIds } from '@/lib/promptVariableMenu'
import { RESEARCH_PROMPT_DEFAULTS_BY_ID, type ResearchPromptId } from '@/lib/researchPromptDefaults'
import {
  getClientPromptRequirements,
  getClientSdrPrompts,
  getWorkspacePromptModels,
  getWorkspacePromptRequirements,
  getWorkspaceResearchPromptOverrides,
  resetClientSdrPrompt,
  setClientPromptRequirements,
  setClientSdrPrompt,
  setWorkspacePromptModel,
} from '@/services/workspaceCampaigns'

/**
 * The inbox stage that owns the model call.
 *
 * A host's reply is answered in one request: the reply prompt, with the nudge
 * prompt appended to it as a guidance block. So there is one model to choose
 * and inbox_reply is the stage that chooses it — inbox_nudges has no request
 * of its own. The edge function refuses a model for inbox_nudges for the same
 * reason, and the campaign contract script pins the pair together.
 */
const INBOX_MODEL_OWNER: ResearchPromptId = 'inbox_reply'
const INBOX_MODEL_FOLLOWER: ResearchPromptId = 'inbox_nudges'

// The order the run executes in, which is what makes a field "later".
const STAGE_ORDER = [
  'podcast_research', 'host_info', 'guest_info', 'host_name_extractor',
  'find_topics', 'write_email', 'clean_email', 'inbox_reply', 'inbox_nudges',
]

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
  const promptsKey = ['client-sdr-prompts', workspaceId, clientId] as const

  const promptsQuery = useQuery({
    queryKey: promptsKey,
    queryFn: () => getClientSdrPrompts(workspaceId, clientId),
    retry: false,
    staleTime: 60_000,
  })
  const overrides = promptsQuery.data ?? {}

  // Requirements resolve the way the prompts do: this client's row wins, and
  // where it has none the workspace set applies.
  const workspaceRequirementsQuery = useQuery({
    queryKey: ['workspace-prompt-requirements', workspaceId],
    queryFn: () => getWorkspacePromptRequirements(workspaceId),
    retry: false,
    staleTime: 60_000,
  })
  const clientRequirementsQuery = useQuery({
    queryKey: ['client-prompt-requirements', workspaceId, clientId],
    queryFn: () => getClientPromptRequirements(workspaceId, clientId),
    retry: false,
    staleTime: 60_000,
  })
  const workspaceRequirements = workspaceRequirementsQuery.data ?? {}
  const clientRequirements = clientRequirementsQuery.data ?? {}
  const effectiveRequirements = (id: ResearchPromptId): string[] =>
    clientRequirements[id] ?? workspaceRequirements[id] ?? []

  // Which model the inbox stages run on. Workspace-level, unlike everything
  // else on this card — the copy below says so, because a per-client screen is
  // exactly where someone would assume otherwise. Same query keys as the
  // campaign dialog, so the two screens cannot show different answers.
  const modelsEnabled = canManage && expanded === INBOX_MODEL_OWNER
  const promptOverridesQuery = useQuery({
    queryKey: ['workspace-research-prompts', workspaceId],
    queryFn: () => getWorkspaceResearchPromptOverrides(workspaceId),
    enabled: expanded === INBOX_MODEL_OWNER || expanded === INBOX_MODEL_FOLLOWER,
    retry: false,
    staleTime: 60_000,
  })
  // Read live from Anthropic, so it reflects what this workspace's key can
  // actually reach. Only fetched once an inbox stage is open: it is a provider
  // round trip, and most visits to this card never touch the model.
  const promptModelsQuery = useQuery({
    queryKey: ['workspace-prompt-models', workspaceId],
    queryFn: () => getWorkspacePromptModels(workspaceId),
    enabled: modelsEnabled,
    retry: false,
    staleTime: 10 * 60_000,
  })
  const promptModels = promptModelsQuery.data ?? []
  const inboxModel = promptOverridesQuery.data?.[INBOX_MODEL_OWNER]?.model ?? null
  const inboxDefaultModel = RESEARCH_PROMPT_DEFAULTS_BY_ID[INBOX_MODEL_OWNER].model
  const setPromptModelMutation = useMutation({
    mutationFn: (model: string | null) =>
      setWorkspacePromptModel(workspaceId, INBOX_MODEL_OWNER, model),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-research-prompts', workspaceId] })
      toast.success('Inbox model saved for the workspace.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The model could not be saved.')
    },
  })

  const saveRequirementsMutation = useMutation({
    mutationFn: ({ id, required }: { id: ResearchPromptId; required: string[] }) =>
      setClientPromptRequirements(workspaceId, clientId, id, required),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['client-prompt-requirements', workspaceId, clientId] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The field requirements could not be saved.')
    },
  })
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

  const activePrompt = PROMPT_GROUPS.flatMap((group) => group.prompts).find((item) => item.id === expanded) ?? null

  return (
    <>
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
                return (
                  <div key={prompt.id} className="rounded-xl border">
                    <div className="flex flex-wrap items-start justify-between gap-2 p-3.5">
                      <button
                        type="button"
                        onClick={() => setExpanded(prompt.id)}
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
                        <Button type="button" size="sm" variant="outline" onClick={() => setExpanded(prompt.id)}>
                          <Pencil className="mr-2 h-3.5 w-3.5" />Edit
                          <span className="sr-only"> {prompt.title}</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </section>
          ))
        )}
      </CardContent>
    </Card>

      {/* A prompt is a page of writing, not a form field. Editing it inside the
          card meant a 13-line monospace box wedged between other rows, with the
          variable palette and the required-field controls competing for the
          same width. It gets the screen now. */}
      <Dialog open={Boolean(activePrompt)} onOpenChange={(next) => { if (!next) setExpanded(null) }}>
        <DialogContent className="grid max-h-[94vh] w-[calc(100%-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-4xl">
          {activePrompt && (() => {
            const prompt = activePrompt
            const saved = overrides[prompt.id]?.content
            const fallback = RESEARCH_PROMPT_DEFAULTS_BY_ID[prompt.id].content
            const value = drafts[prompt.id] ?? saved ?? fallback
            const dirty = value !== (saved ?? fallback)
            const busy = saveMutation.isPending || resetMutation.isPending
            return (
              <>
                <DialogHeader className="border-b py-5 pl-6 pr-12 text-left">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {saved
                      ? <Badge variant="secondary" className="text-[10px]">Custom for {clientName.split(' ')[0]}</Badge>
                      : <Badge variant="outline" className="text-[10px] text-muted-foreground">Workspace default</Badge>}
                    {dirty && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-800">Unsaved</Badge>}
                  </div>
                  <DialogTitle>{prompt.title}</DialogTitle>
                  <DialogDescription>{prompt.detail}</DialogDescription>
                </DialogHeader>
                <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-5">
              <div className="space-y-4 border-t p-3.5">
                {prompt.id === INBOX_MODEL_OWNER && (
                  <div className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label
                        htmlFor="client-sdr-inbox-model"
                        className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Model the inbox runs on
                      </label>
                      {promptModelsQuery.isError && (
                        <button
                          type="button"
                          className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                          onClick={() => void promptModelsQuery.refetch()}
                        >
                          Retry
                        </button>
                      )}
                    </div>
                    <select
                      id="client-sdr-inbox-model"
                      className="mt-2 h-8 w-full rounded border bg-background px-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={!canManage || promptModelsQuery.isLoading || promptModelsQuery.isError || setPromptModelMutation.isPending}
                      value={inboxModel ?? ''}
                      onChange={(event) => setPromptModelMutation.mutate(
                        event.target.value === '' ? null : event.target.value,
                      )}
                    >
                      {/* Empty means "follow the shipped default", which is not the same
                          as pinning that default's id — if we change the default, a
                          workspace that never chose should move with it. */}
                      <option value="">Default ({inboxDefaultModel})</option>
                      {promptModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label} — {model.id}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                      {promptModelsQuery.isError
                        ? 'The model list could not be read from Anthropic, so this cannot be changed right now. The prompt below still saves.'
                        : promptModelsQuery.isLoading
                          ? 'Reading the models this workspace can use…'
                          : `Unlike the prompt below, this is a workspace setting — it applies to every client, not just ${clientName}. One call answers each reply, so the follow-up nudges are written on this model too.`}
                    </p>
                  </div>
                )}
                {prompt.id === INBOX_MODEL_FOLLOWER && (
                  <p className="rounded-lg border bg-muted/20 p-3 text-[11px] leading-5 text-muted-foreground">
                    These nudges are written in the same model call as the reply, not one
                    of their own, so they run on whichever model
                    <span className="font-medium text-foreground"> Reply instructions </span>
                    is set to{inboxModel || promptOverridesQuery.isSuccess
                      ? ` (${inboxModel ?? inboxDefaultModel})`
                      : ''}. Choosing a separate model here would mean a second call
                    for every host reply.
                  </p>
                )}
                <PromptVariableTextarea
                  omitVariableIds={unavailableVariableIds(prompt.id, STAGE_ORDER)}
                  value={value}
                  readOnly={!canManage}
                  ariaLabel={`${prompt.title} for ${clientName}`}
                  onChange={(next) => setDrafts((current) => ({ ...current, [prompt.id]: next }))}
                  className="min-h-52 font-mono text-xs leading-5"
                  maxLength={20_000}
                />
                <PromptRequiredFields
                  content={value}
                  required={effectiveRequirements(prompt.id)}
                  disabled={!canManage || busy}
                  inheritedNote={clientRequirements[prompt.id]
                    ? undefined
                    : `Inherited from the workspace. Changing one here sets it for ${clientName.split(' ')[0]} only.`}
                  onChange={(next) => saveRequirementsMutation.mutate({ id: prompt.id, required: next })}
                />
              </div>
                </div>
                <DialogFooter className="gap-2 border-t px-6 py-4 sm:justify-between">
                  <div className="flex items-center gap-2">
                    {canManage && saved && (
                      <Button type="button" variant="ghost" disabled={busy} onClick={() => resetMutation.mutate(prompt.id)}>
                        <RotateCcw className="mr-2 h-4 w-4" />Reset to workspace default
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => setExpanded(null)} disabled={busy}>Cancel</Button>
                    {canManage && (
                      <Button type="button" disabled={!dirty || busy} onClick={() => saveMutation.mutate({ id: prompt.id, content: value })}>
                        {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save prompt
                      </Button>
                    )}
                  </div>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </>
  )
}
