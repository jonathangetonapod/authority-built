import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  clearWorkspaceAiKey,
  getWorkspaceAiKeys,
  setWorkspaceAiKey,
  type WorkspaceAiKeyStatus,
} from '@/services/workspaceStaff'

const PROVIDERS = [
  { id: 'anthropic' as const, label: 'Anthropic (Claude)', placeholder: 'sk-ant-…' },
  { id: 'openai' as const, label: 'OpenAI', placeholder: 'sk-…' },
]

export function WorkspaceAiKeysCard({ workspaceId, queryScope }: { workspaceId: string; queryScope: readonly unknown[] }) {
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const queryKey = [...queryScope, 'workspace-ai-keys']

  const keysQuery = useQuery({
    queryKey,
    queryFn: () => getWorkspaceAiKeys(workspaceId),
    retry: false,
  })

  const saveMutation = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: 'anthropic' | 'openai'; apiKey: string }) =>
      setWorkspaceAiKey(workspaceId, provider, apiKey),
    onSuccess: (_result, variables) => {
      setDrafts((current) => ({ ...current, [variables.provider]: '' }))
      void queryClient.invalidateQueries({ queryKey })
      toast.success('API key verified and saved. Operations using it will not consume platform credits.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The API key could not be saved.')
    },
  })

  const removeMutation = useMutation({
    mutationFn: (provider: 'anthropic' | 'openai') => clearWorkspaceAiKey(workspaceId, provider),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey })
      toast.success('API key removed. Operations now use platform credits.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The API key could not be removed.')
    },
  })

  const busy = saveMutation.isPending || removeMutation.isPending

  const statusFor = (provider: 'anthropic' | 'openai'): WorkspaceAiKeyStatus | null =>
    keysQuery.data?.[provider] ?? null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><KeyRound className="h-5 w-5" />AI API keys</CardTitle>
        <CardDescription>
          Bring your own provider keys. AI operations that run on your keys are billed to your provider
          account directly and never consume platform credits. Keys are stored encrypted and can't be
          viewed after saving.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {keysQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Loading key status…
          </div>
        ) : (
          PROVIDERS.map((provider) => {
            const status = statusFor(provider.id)
            return (
              <div key={provider.id} className="space-y-2 rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{provider.label}</p>
                  {status?.configured ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                      Connected ····{status.last_four}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Using platform credits</Badge>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="flex-1">
                    <Label htmlFor={`ai-key-${provider.id}`} className="sr-only">{provider.label} API key</Label>
                    <Input
                      id={`ai-key-${provider.id}`}
                      type="password"
                      autoComplete="off"
                      placeholder={status?.configured ? 'Enter a new key to replace the saved one' : provider.placeholder}
                      value={drafts[provider.id] ?? ''}
                      onChange={(event) => setDrafts((current) => ({ ...current, [provider.id]: event.target.value }))}
                      disabled={busy}
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={busy || !(drafts[provider.id] ?? '').trim()}
                    onClick={() => saveMutation.mutate({ provider: provider.id, apiKey: (drafts[provider.id] ?? '').trim() })}
                  >
                    {saveMutation.isPending ? 'Verifying…' : 'Save key'}
                  </Button>
                  {status?.configured && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => removeMutation.mutate(provider.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />Remove
                    </Button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
