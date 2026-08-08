import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpRight, Bot, Loader2, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  createWorkspaceClient,
  deleteWorkspaceClient,
  getWorkspaceClients,
  updateWorkspaceClient,
  type WorkspaceClient,
  type WorkspaceClientInput,
} from '@/services/clients'
import { getAdminWorkspaceView, type AdminWorkspaceView } from '@/services/adminWorkspaces'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import { MY_WORKSPACE_BASE_HREF, selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const emptyClient: WorkspaceClientInput = {
  name: '',
  email: '',
  contact_person: '',
  linkedin_url: '',
  website: '',
  status: 'active',
  notes: '',
}

interface WorkspaceClientsProps {
  platformWorkspaceId?: string
  mode?: 'manage' | 'research'
}

function validatePlatformWorkspaceView(view: AdminWorkspaceView, workspaceId: string): AdminWorkspaceView {
  if (
    view.workspace.id !== workspaceId
    || view.workspace.is_default
    || view.workspace.status !== 'active'
    || view.viewer.workspace_id !== workspaceId
    || view.viewer.role !== 'owner'
    || !view.viewer.email
    || view.clients.some((client) => client.workspace_id !== workspaceId)
  ) {
    throw new Error('The selected workspace response did not match the workspace address.')
  }
  return view
}

const WorkspaceClients = ({ platformWorkspaceId, mode = 'manage' }: WorkspaceClientsProps) => {
  const { canWriteClients, user, workspace } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WorkspaceClient | null>(null)
  const [deleting, setDeleting] = useState<WorkspaceClient | null>(null)
  const [form, setForm] = useState<WorkspaceClientInput>(emptyClient)
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const selectedWorkspaceId = (platformWorkspaceId || '').toLowerCase()
  const validSelectedWorkspaceId = UUID_PATTERN.test(selectedWorkspaceId)
  const tenantWorkspaceId = workspace?.id || ''
  const tenantQueryKey = ['tenant', user?.id || 'unknown', tenantWorkspaceId, 'clients'] as const
  const platformQueryKey = ['platform', user?.id || 'unknown', 'workspace', selectedWorkspaceId, 'clients'] as const

  const tenantClientsQuery = useQuery({
    queryKey: tenantQueryKey,
    queryFn: () => getWorkspaceClients(tenantWorkspaceId),
    enabled: !isPlatformWorkspace && Boolean(tenantWorkspaceId),
  })

  const platformQuery = useQuery({
    queryKey: platformQueryKey,
    queryFn: async ({ signal }) => validatePlatformWorkspaceView(
      await getAdminWorkspaceView(selectedWorkspaceId, signal),
      selectedWorkspaceId,
    ),
    enabled: isPlatformWorkspace && validSelectedWorkspaceId,
    retry: false,
    gcTime: 0,
  })

  useEffect(() => {
    if (!isPlatformWorkspace && tenantClientsQuery.error) {
      toast.error(tenantClientsQuery.error instanceof Error ? tenantClientsQuery.error.message : 'Unable to load clients.')
    }
  }, [isPlatformWorkspace, tenantClientsQuery.error])

  const effectiveWorkspace = isPlatformWorkspace
    ? platformQuery.data?.workspace || null
    : workspace
  const workspaceId = effectiveWorkspace?.id || ''
  const workspaceClients = isPlatformWorkspace
    ? platformQuery.data?.clients || []
    : tenantClientsQuery.data || []
  const clients = mode === 'research'
    ? workspaceClients.filter((client) => client.status === 'active')
    : workspaceClients
  const clientsLoading = isPlatformWorkspace
    ? validSelectedWorkspaceId && platformQuery.isLoading
    : tenantClientsQuery.isLoading
  const clientsError = isPlatformWorkspace
    ? !validSelectedWorkspaceId
      ? new Error('The workspace address is invalid.')
      : platformQuery.error
    : tenantClientsQuery.error
  const refetchClients = isPlatformWorkspace ? platformQuery.refetch : tenantClientsQuery.refetch
  const activeQueryKey = isPlatformWorkspace ? platformQueryKey : tenantQueryKey
  const managementEnabled = isPlatformWorkspace || canWriteClients
  const showManagementControls = mode === 'manage' && managementEnabled
  const clientBaseHref = isPlatformWorkspace
    ? selectedWorkspaceBaseHref(selectedWorkspaceId)
    : MY_WORKSPACE_BASE_HREF

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Enter-key repeat fires the form submit synchronously, before the
      // button's disabled state re-renders — without this a create could
      // POST twice and duplicate the client (no unique constraint upstream).
      if (saveMutation.isPending) throw new Error('Already saving.')
      if (!workspaceId) throw new Error('Workspace is unavailable.')
      if (!form.name.trim()) throw new Error('Client name is required.')
      return editing
        ? updateWorkspaceClient(workspaceId, editing.id, form)
        : createWorkspaceClient(workspaceId, form)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: activeQueryKey })
      setDialogOpen(false)
      setEditing(null)
      setForm(emptyClient)
      toast.success(editing ? 'Client updated.' : 'Client added.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to save client.'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (client: WorkspaceClient) => {
      if (!workspaceId) throw new Error('Workspace is unavailable.')
      await deleteWorkspaceClient(workspaceId, client.id)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: activeQueryKey })
      setDeleting(null)
      toast.success('Client removed.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to remove client.'),
  })

  const openCreate = () => {
    if (!managementEnabled) return
    setEditing(null)
    setForm(emptyClient)
    setDialogOpen(true)
  }

  const openEdit = (client: WorkspaceClient) => {
    if (!managementEnabled) return
    setEditing(client)
    setForm({
      name: client.name,
      email: client.email || '',
      contact_person: client.contact_person || '',
      linkedin_url: client.linkedin_url || '',
      website: client.website || '',
      status: client.status,
      notes: client.notes || '',
    })
    setDialogOpen(true)
  }

  if (!isPlatformWorkspace && !workspace) {
    return (
      <WorkspaceLayout>
        <Card><CardHeader><CardTitle>Workspace unavailable</CardTitle><CardDescription>Your account does not have an active workspace.</CardDescription></CardHeader></Card>
      </WorkspaceLayout>
    )
  }

  const platformWorkspace = isPlatformWorkspace
    ? {
        workspaceId: selectedWorkspaceId,
        workspaceName: effectiveWorkspace?.name || 'Client workspace',
        logoUrl: workspaceLogoUrl(
          effectiveWorkspace?.id,
          effectiveWorkspace?.logo_path,
          effectiveWorkspace?.logo_updated_at,
        ),
        baseHref: selectedWorkspaceBaseHref(selectedWorkspaceId),
      }
    : undefined

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {mode === 'research' ? 'Podcast Finder' : 'Clients'}
            </h1>
            <p className="text-muted-foreground">
              {mode === 'research'
                ? `Choose a client in ${effectiveWorkspace?.name || 'this workspace'} to start podcast research.`
                : `Clients in ${effectiveWorkspace?.name || 'this workspace'}`}
            </p>
          </div>
          {showManagementControls && (
            <Button
              onClick={openCreate}
              disabled={!managementEnabled}
            >
              <Plus className="mr-2 h-4 w-4" />Add client
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />{mode === 'research' ? 'Choose a client' : 'Your clients'}</CardTitle>
            <CardDescription>
              {mode === 'research'
                ? 'Research is permanently bound to the workspace and active client you choose.'
                : 'Only members of this workspace can access these records.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {clientsLoading ? (
              <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
            ) : clientsError ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
                <p className="font-medium text-destructive">Clients could not be loaded</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  {clientsError instanceof Error ? clientsError.message : 'Check your connection and try again.'}
                </p>
                {validSelectedWorkspaceId || !isPlatformWorkspace ? (
                  <Button variant="outline" onClick={() => void refetchClients()}>Try again</Button>
                ) : null}
              </div>
            ) : clients.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
                <Users className="h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="font-medium">{mode === 'research' ? 'No active clients' : 'No clients yet'}</p>
                  <p className="text-sm text-muted-foreground">
                    {mode === 'research' ? 'Add or reactivate a client before starting podcast research.' : 'Add your first client to begin.'}
                  </p>
                </div>
                {showManagementControls ? (
                  <Button
                    onClick={openCreate}
                    variant="outline"
                    disabled={!managementEnabled}
                  >
                    <Plus className="mr-2 h-4 w-4" />Add client
                  </Button>
                ) : mode === 'research' ? (
                  <Button asChild variant="outline">
                    <Link to={`${clientBaseHref}/clients`}><Users className="mr-2 h-4 w-4" />Manage clients</Link>
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Contact</TableHead><TableHead>AI SDR Profile</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {clients.map((client) => {
                      const clientDetailHref = `${clientBaseHref}/clients/${encodeURIComponent(client.id)}`
                      return (
                      <TableRow
                        key={client.id}
                        tabIndex={0}
                        aria-label={`Open ${client.name}`}
                        className="group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        onClick={() => navigate(clientDetailHref)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            navigate(clientDetailHref)
                          }
                        }}
                      >
                        <TableCell><Link to={clientDetailHref} onClick={(event) => event.stopPropagation()} aria-label={`Open ${client.name}`} className="inline-flex items-center gap-1.5 font-medium group-hover:text-primary group-hover:underline">{client.name}<ArrowUpRight className="h-3.5 w-3.5" /></Link>{client.website && <p className="max-w-xs truncate text-xs text-muted-foreground">{client.website}</p>}</TableCell>
                        <TableCell><p>{client.contact_person || '—'}</p><p className="text-xs text-muted-foreground">{client.email || 'No email'}</p></TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={client.ai_sdr_profile_ready
                              ? 'gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'gap-1.5 border-amber-200 bg-amber-50 text-amber-800'}
                          >
                            <Bot className="h-3 w-3" />
                            {client.ai_sdr_profile_ready
                              ? 'Ready'
                              : `${client.ai_sdr_profile_completed_fields || 0} of ${client.ai_sdr_profile_total_fields || 6}`}
                          </Badge>
                        </TableCell>
                        <TableCell><Badge variant={client.status === 'active' ? 'default' : 'secondary'} className="capitalize">{client.status}</Badge></TableCell>
                        <TableCell className="text-right" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                          <div className="inline-flex items-center gap-1">
                            {showManagementControls && (
                              <>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => openEdit(client)}
                                aria-label={`Edit ${client.name}`}
                                disabled={!managementEnabled}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => managementEnabled && setDeleting(client)}
                                aria-label={`Remove ${client.name}`}
                                disabled={!managementEnabled}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null) }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editing ? 'Edit client' : 'Add client'}</DialogTitle><DialogDescription>{editing ? 'Update this client inside your private workspace.' : 'Create a client visible only inside your private workspace.'}</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); saveMutation.mutate() }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="client-name">Client name</Label><Input id="client-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="client-email">Email</Label><Input id="client-email" type="email" value={form.email || ''} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="client-contact">Contact person</Label><Input id="client-contact" value={form.contact_person || ''} onChange={(event) => setForm({ ...form, contact_person: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="client-website">Website</Label><Input id="client-website" type="url" value={form.website || ''} onChange={(event) => setForm({ ...form, website: event.target.value })} /></div>
              <div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={(value: WorkspaceClientInput['status']) => setForm({ ...form, status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="paused">Paused</SelectItem><SelectItem value="churned">Churned</SelectItem></SelectContent></Select></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="client-linkedin">LinkedIn URL</Label><Input id="client-linkedin" type="url" value={form.linkedin_url || ''} onChange={(event) => setForm({ ...form, linkedin_url: event.target.value })} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="client-notes">Notes</Label><Textarea id="client-notes" value={form.notes || ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? 'Save changes' : 'Add client'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !deleteMutation.isPending) setDeleting(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove client?</DialogTitle><DialogDescription>This permanently removes {deleting?.name} and may remove connected records. This action cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" disabled={deleteMutation.isPending} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleting && deleteMutation.mutate(deleting)}>{deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Remove client</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspaceLayout>
  )
}

export default WorkspaceClients
