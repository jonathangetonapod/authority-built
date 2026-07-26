import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Copy, Eye, EyeOff, KeyRound, Loader2, PauseCircle, PlayCircle, RefreshCw, Send, Settings2, Trash2, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { selectedWorkspaceBaseHref, workspaceModuleHref } from '@/lib/workspaceRoutes'
import { resetWorkspaceStaffTemporaryPassword } from '@/services/workspaceStaff'
import {
  inviteWorkspaceUser,
  createManualWorkspaceAccount,
  listWorkspaceUsers,
  revokeManualWorkspaceAccount,
  retryManualWorkspaceAccount,
  rotateManualWorkspacePassword,
  updateWorkspaceUserStatus,
  type ManualWorkspaceCredential,
  type ManagedWorkspaceUser,
} from '@/services/workspaceUsers'

type PendingAction =
  | 'suspend'
  | 'reactivate'
  | 'revoke_pending'
  | 'revoke_manual'
  | 'retry_invite'

function isExpiredInvite(user: ManagedWorkspaceUser): boolean {
  if (user.status !== 'invited' || !user.invite_expires_at) return false
  const expiresAt = Date.parse(user.invite_expires_at)
  return Number.isFinite(expiresAt) && expiresAt <= Date.now()
}

function formatAccountDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString()
}

function reconciliationReady(value: string | null): boolean {
  if (!value) return false
  const reviewAt = Date.parse(value)
  return Number.isFinite(reviewAt) && reviewAt <= Date.now()
}

const WorkspaceUsers = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [manualFullName, setManualFullName] = useState('')
  const [manualWorkspaceName, setManualWorkspaceName] = useState('')
  const [manualSubmitting, setManualSubmitting] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)
  const [credential, setCredential] = useState<(ManualWorkspaceCredential & { workspaceName?: string }) | null>(null)
  const [credentialVisible, setCredentialVisible] = useState(false)
  const [credentialCopied, setCredentialCopied] = useState(false)
  const [credentialSaved, setCredentialSaved] = useState(false)
  const [credentialBusyId, setCredentialBusyId] = useState<string | null>(null)
  const [credentialConfirmation, setCredentialConfirmation] = useState<ManagedWorkspaceUser | null>(null)
  const [confirmation, setConfirmation] = useState<{ user: ManagedWorkspaceUser; action: PendingAction } | null>(null)
  const platformQueryPrefix = ['platform'] as const
  const queryKey = ['platform', 'workspace-users'] as const

  const usersQuery = useQuery({ queryKey, queryFn: listWorkspaceUsers })

  const inviteMutation = useMutation({
    mutationFn: () => inviteWorkspaceUser({
      email: email.trim(),
      full_name: fullName.trim() || undefined,
      workspace_name: workspaceName.trim() || undefined,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: platformQueryPrefix })
      setInviteOpen(false)
      setEmail('')
      setFullName('')
      setWorkspaceName('')
      toast.success('Invitation sent.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to send invitation.'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: platformQueryPrefix }),
  })

  const statusMutation = useMutation({
    mutationFn: async ({ user, action }: { user: ManagedWorkspaceUser; action: PendingAction }) => {
      if (action === 'revoke_manual') {
        await revokeManualWorkspaceAccount(user.id, crypto.randomUUID())
        return
      }
      await updateWorkspaceUserStatus(action, user.id)
    },
    onSuccess: async (_result, variables) => {
      if (variables.action === 'revoke_manual' || variables.action === 'revoke_pending') {
        queryClient.setQueryData<ManagedWorkspaceUser[]>(queryKey, (current) => (
          current?.filter((managedUser) => managedUser.id !== variables.user.id) || []
        ))
      }
      await queryClient.invalidateQueries({ queryKey: platformQueryPrefix })
      setConfirmation(null)
      toast.success(
        variables.action === 'suspend'
          ? 'Account suspended.'
          : variables.action === 'reactivate'
            ? 'Account reactivated.'
            : variables.action === 'revoke_manual'
              ? variables.user.status === 'revoked'
                ? 'Account deletion completed.'
                : 'Account deleted.'
            : variables.action === 'retry_invite'
              ? 'Invitation finalized.'
              : isExpiredInvite(variables.user)
                ? 'Expired invitation deleted. You can now create a fresh account for this email.'
              : variables.user.status === 'revoked'
                ? 'Invitation deletion completed.'
                : 'Invitation deleted.',
      )
    },
    onError: (error) => {
      setConfirmation(null)
      toast.error(error instanceof Error ? error.message : 'Unable to update account.')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: platformQueryPrefix }),
  })

  const clearCredential = () => {
    setCredential(null)
    setCredentialVisible(false)
    setCredentialCopied(false)
    setCredentialSaved(false)
    setManualError(null)
  }

  const showCredential = (result: ManualWorkspaceCredential, fallbackWorkspaceName?: string) => {
    setCredential({ ...result, workspaceName: result.workspace?.name || fallbackWorkspaceName })
    setCredentialVisible(false)
    setCredentialCopied(false)
    setCredentialSaved(false)
    setManualError(null)
    setManualOpen(true)
  }

  const createManualAccount = async (event: React.FormEvent) => {
    event.preventDefault()
    setManualSubmitting(true)
    setManualError(null)
    try {
      const result = await createManualWorkspaceAccount({
        request_id: crypto.randomUUID(),
        email: manualEmail.trim(),
        full_name: manualFullName.trim() || undefined,
        workspace_name: manualWorkspaceName.trim() || undefined,
      })
      showCredential(result, manualWorkspaceName.trim() || undefined)
      setManualEmail('')
      setManualFullName('')
      setManualWorkspaceName('')
    } catch (error) {
      setManualError(error instanceof Error ? error.message : 'The manual account could not be created.')
    } finally {
      void queryClient.invalidateQueries({ queryKey: platformQueryPrefix })
      setManualSubmitting(false)
    }
  }

  const issueOwnerCredential = async (managedUser: ManagedWorkspaceUser) => {
    setCredentialBusyId(managedUser.id)
    setManualError(null)
    try {
      let result: ManualWorkspaceCredential
      if (managedUser.status === 'active') {
        const reset = await resetWorkspaceStaffTemporaryPassword(
          managedUser.workspace_id,
          managedUser.id,
        )
        result = {
          membership: {
            id: reset.member.id,
            workspace_id: managedUser.workspace_id,
            status: reset.member.status,
            provisioning_method: 'admin_temporary_password',
            password_change_required: true,
            invite_expires_at: reset.member.invite_expires_at,
          },
          workspace: managedUser.workspace,
          email: reset.email,
          temporary_password: reset.temporary_password,
        }
      } else {
        result = managedUser.status === 'provisioning'
          ? await retryManualWorkspaceAccount(managedUser.id, crypto.randomUUID())
          : await rotateManualWorkspacePassword(managedUser.id, crypto.randomUUID())
      }
      showCredential(result, managedUser.workspace?.name)
      setCredentialConfirmation(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The owner password could not be reset.')
    } finally {
      void queryClient.invalidateQueries({ queryKey: platformQueryPrefix })
      setCredentialBusyId(null)
    }
  }

  const copyCredential = async () => {
    if (!credential) return
    try {
      await navigator.clipboard.writeText(credential.temporary_password)
      setCredentialCopied(true)
      setManualError(null)
    } catch {
      setCredentialVisible(true)
      setManualError('Clipboard access is unavailable. Select and copy the visible password manually.')
    }
  }

  const users = (usersQuery.data || []).filter((managedUser) => managedUser.status !== 'revoked')

  return (
    <WorkspaceLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h1 className="text-3xl font-bold tracking-tight">Workspace owners</h1><p className="text-muted-foreground">Create workspaces and manage each owner's sign-in access.</p></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { clearCredential(); setManualOpen(true) }}>
              <KeyRound className="mr-2 h-4 w-4" />Create workspace
            </Button>
            <Button onClick={() => setInviteOpen(true)}><UserPlus className="mr-2 h-4 w-4" />Invite agency owner</Button>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Owner accounts</CardTitle><CardDescription>Reset an owner's password here or open their workspace settings to manage the full team. New passwords are shown once and must be replaced at the owner's next sign-in.</CardDescription></CardHeader>
          <CardContent>
            {usersQuery.isLoading ? (
              <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
            ) : usersQuery.error ? (
              <div className="flex flex-col items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                <p>{usersQuery.error instanceof Error ? usersQuery.error.message : 'Unable to load workspace users.'}</p>
                <Button type="button" size="sm" variant="outline" disabled={usersQuery.isFetching} onClick={() => void usersQuery.refetch()}>
                  {usersQuery.isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Try again
                </Button>
              </div>
            ) : users.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center"><Send className="h-10 w-10 text-muted-foreground" /><div><p className="font-medium">No workspace accounts</p><p className="text-sm text-muted-foreground">Create a workspace manually or invite its agency owner.</p></div></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Workspace</TableHead><TableHead>Status</TableHead><TableHead>Invited</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {users.map((managedUser) => {
                      const inviteExpired = isExpiredInvite(managedUser)
                      const isManualAccount = managedUser.provisioning_method === 'admin_temporary_password'
                      const credentialReviewReady = reconciliationReady(
                        managedUser.credential_reconciliation_review_after,
                      )
                      const inviteReviewReady = reconciliationReady(
                        managedUser.invite_reconciliation_review_after,
                      )
                      const credentialOperationBusy = credentialBusyId === managedUser.id
                      const passwordResetBlocked = credentialOperationBusy
                        || managedUser.auth_reconciliation_pending
                        || managedUser.credential_reconciliation_pending
                      const rotationBlocked = credentialOperationBusy
                        || (
                          managedUser.credential_reconciliation_pending
                          && (
                            !credentialReviewReady
                            || managedUser.credential_reconciliation_claim_kind !== 'temporary_password_rotation'
                          )
                        )
                      const revocationCredentialBlocked = credentialOperationBusy
                        || (managedUser.credential_reconciliation_pending && !credentialReviewReady)
                      const inviteBlocked = managedUser.invite_reconciliation_pending && !inviteReviewReady
                      const manualSetupRetryBlocked = managedUser.invite_reconciliation_pending
                        || rotationBlocked
                      const statusLabel = inviteExpired
                          ? 'expired'
                          : managedUser.password_change_required
                            ? 'password change required'
                            : managedUser.status
                      return (
                      <TableRow key={managedUser.id}>
                        <TableCell><p className="font-medium">{managedUser.full_name || managedUser.email}</p><p className="text-xs text-muted-foreground">{managedUser.email}</p></TableCell>
                        <TableCell>{managedUser.workspace?.name || 'Private workspace'}</TableCell>
                        <TableCell><Badge variant={managedUser.status === 'active' ? 'default' : managedUser.status === 'suspended' || managedUser.status === 'revoked' || inviteExpired ? 'destructive' : 'secondary'} className="capitalize">{statusLabel}</Badge></TableCell>
                        <TableCell>
                          <p>{formatAccountDate(managedUser.invited_at)}</p>
                          {managedUser.invite_expires_at && (
                            <p className={inviteExpired ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'}>
                              {inviteExpired ? 'Expired' : 'Expires'} {formatAccountDate(managedUser.invite_expires_at)}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {managedUser.status === 'active' && <div className="inline-flex flex-col items-end gap-2"><div className="inline-flex flex-wrap justify-end gap-2">{managedUser.workspace?.id && <><Button size="sm" variant="outline" asChild><Link to={workspaceModuleHref(selectedWorkspaceBaseHref(managedUser.workspace.id), 'clients')}><Eye className="mr-2 h-4 w-4" />Open workspace</Link></Button><Button size="sm" variant="outline" asChild><Link to={workspaceModuleHref(selectedWorkspaceBaseHref(managedUser.workspace.id), 'settings')}><Settings2 className="mr-2 h-4 w-4" />Manage users</Link></Button></>}<Button size="sm" variant="outline" disabled={passwordResetBlocked} onClick={() => setCredentialConfirmation(managedUser)}>{credentialOperationBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}Reset password</Button><Button size="sm" variant="outline" disabled={managedUser.auth_reconciliation_pending} onClick={() => setConfirmation({ user: managedUser, action: 'suspend' })}><PauseCircle className="mr-2 h-4 w-4" />Suspend</Button></div>{(managedUser.auth_reconciliation_pending || managedUser.credential_reconciliation_pending) && <p className="max-w-64 text-xs font-medium text-destructive">Account actions are temporarily unavailable. Operator review is required.</p>}</div>}
                          {managedUser.status === 'suspended' && <div className="inline-flex flex-col items-end gap-2"><Button size="sm" variant="outline" disabled={managedUser.auth_reconciliation_pending} onClick={() => setConfirmation({ user: managedUser, action: 'reactivate' })}><PlayCircle className="mr-2 h-4 w-4" />Reactivate</Button>{managedUser.auth_reconciliation_pending && <p className="max-w-64 text-xs font-medium text-destructive">Account actions are temporarily unavailable. Operator review is required.</p>}</div>}
                          {managedUser.status === 'provisioning' && <div className="inline-flex flex-col items-end gap-2"><div className="inline-flex flex-wrap justify-end gap-2">{isManualAccount ? <><Button size="sm" variant="outline" disabled={manualSetupRetryBlocked} onClick={() => void issueOwnerCredential(managedUser)}>{credentialBusyId === managedUser.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Retry manual setup</Button><Button size="sm" variant="outline" className="text-destructive" disabled={inviteBlocked || revocationCredentialBlocked} onClick={() => setConfirmation({ user: managedUser, action: 'revoke_manual' })}><Trash2 className="mr-2 h-4 w-4" />Delete</Button></> : <><Button size="sm" variant="outline" disabled={managedUser.invite_reconciliation_pending} onClick={() => setConfirmation({ user: managedUser, action: 'retry_invite' })}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button><Button size="sm" variant="outline" className="text-destructive" disabled={managedUser.invite_reconciliation_pending} onClick={() => setConfirmation({ user: managedUser, action: 'revoke_pending' })}><Trash2 className="mr-2 h-4 w-4" />Delete</Button></>}</div>{managedUser.invite_reconciliation_pending && <p className="max-w-64 text-xs font-medium text-destructive">{inviteReviewReady ? 'Manual setup cannot resume. Delete this account, then create it again.' : `Manual setup reconciliation is pending until ${formatAccountDate(managedUser.invite_reconciliation_review_after)}.`}</p>}{managedUser.credential_reconciliation_pending && <p className="max-w-64 text-xs font-medium text-destructive">Credential reconciliation {credentialReviewReady ? 'is ready for an allowed recovery action.' : `is pending until ${formatAccountDate(managedUser.credential_reconciliation_review_after)}.`}</p>}</div>}
                          {managedUser.status === 'invited' && isManualAccount && <div className="inline-flex flex-col items-end gap-2"><div className="inline-flex flex-wrap justify-end gap-2">{managedUser.workspace?.id && <Button size="sm" variant="outline" asChild><Link to={workspaceModuleHref(selectedWorkspaceBaseHref(managedUser.workspace.id), 'clients')}><Eye className="mr-2 h-4 w-4" />Open workspace</Link></Button>}<Button size="sm" variant="outline" disabled={rotationBlocked} onClick={() => setCredentialConfirmation(managedUser)}>{credentialBusyId === managedUser.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}Issue new temporary password</Button><Button size="sm" variant="outline" className="text-destructive" disabled={revocationCredentialBlocked} onClick={() => setConfirmation({ user: managedUser, action: 'revoke_manual' })}><Trash2 className="mr-2 h-4 w-4" />Delete</Button></div>{managedUser.credential_reconciliation_pending ? <p className="max-w-64 text-xs font-medium text-destructive">{managedUser.credential_reconciliation_claim_kind === 'staff_password_reset' ? 'This workspace password reset requires operator review.' : credentialReviewReady ? managedUser.credential_reconciliation_claim_kind === 'initial_password_change' ? 'The user may retry password setup, or you may delete this account.' : 'Credential rotation is ready to retry.' : `Credential reconciliation is pending until ${formatAccountDate(managedUser.credential_reconciliation_review_after)}.`}</p> : <p className="max-w-64 text-xs text-muted-foreground">Issuing a replacement immediately invalidates the previous temporary password.</p>}</div>}
                          {managedUser.status === 'invited' && !isManualAccount && <div className="inline-flex flex-col items-end gap-2"><Button size="sm" variant="outline" className="text-destructive" disabled={managedUser.invite_reconciliation_pending} onClick={() => setConfirmation({ user: managedUser, action: 'revoke_pending' })}><Trash2 className="mr-2 h-4 w-4" />{inviteExpired ? 'Delete expired invite' : 'Delete'}</Button>{managedUser.invite_reconciliation_pending && <p className="max-w-64 text-xs font-medium text-destructive">Invitation removal requires operator review.</p>}</div>}
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

      <Dialog
        open={manualOpen}
        onOpenChange={(open) => {
          if (!open && manualSubmitting) return
          if (!open && credential && !credentialSaved) {
            setManualError('Confirm that you saved the one-time password before closing.')
            return
          }
          setManualOpen(open)
          if (!open) clearCredential()
        }}
      >
        <DialogContent
          onEscapeKeyDown={(event) => {
            if (manualSubmitting || (credential && !credentialSaved)) event.preventDefault()
          }}
          onPointerDownOutside={(event) => {
            if (manualSubmitting || (credential && !credentialSaved)) event.preventDefault()
          }}
        >
          {credential ? (
            <>
              <DialogHeader>
                <DialogTitle>Save the temporary password</DialogTitle>
                <DialogDescription>
                  This password is shown once and cannot be retrieved later. Share it with {credential.email} through a secure channel, not email from this app.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {credential.workspaceName && (
                  <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Workspace</p><p className="font-medium">{credential.workspaceName}</p></div>
                )}
                <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p><p className="font-medium">{credential.email}</p></div>
                <div className="space-y-2">
                  <Label htmlFor="temporary-password">Temporary password</Label>
                  <div className="flex gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Input
                        id="temporary-password"
                        type={credentialVisible ? 'text' : 'password'}
                        readOnly
                        value={credential.temporary_password}
                        className="pr-10 font-mono"
                        autoComplete="off"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setCredentialVisible((value) => !value)}
                        aria-label={credentialVisible ? 'Hide temporary password' : 'Reveal temporary password'}
                      >
                        {credentialVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <Button type="button" variant="outline" onClick={() => void copyCredential()}>
                      <Copy className="mr-2 h-4 w-4" />{credentialCopied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  The account cannot access workspace data until this password is replaced at first sign-in.
                </p>
                {credential.membership.invite_expires_at && (
                  <p className="text-sm text-muted-foreground">
                    Temporary access expires {formatAccountDate(credential.membership.invite_expires_at)}.
                  </p>
                )}
                {manualError && <p className="text-sm text-destructive" role="alert">{manualError}</p>}
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="credential-saved"
                    checked={credentialSaved}
                    onCheckedChange={(checked) => setCredentialSaved(checked === true)}
                  />
                  <Label htmlFor="credential-saved" className="font-normal leading-5">
                    I saved this password in a secure place.
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!credentialSaved}
                  onClick={() => { setManualOpen(false); clearCredential() }}
                >
                  Done
                </Button>
                <Button
                  type="button"
                  disabled={!credentialSaved}
                  onClick={() => {
                    const workspaceId = credential.membership.workspace_id
                    setManualOpen(false)
                    clearCredential()
                    navigate(workspaceModuleHref(selectedWorkspaceBaseHref(workspaceId), 'clients'))
                  }}
                >
                  Open workspace
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Create workspace account</DialogTitle>
                <DialogDescription>
                  No invitation email will be sent. A strong temporary password will be generated and shown once after the private workspace is created.
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={createManualAccount}>
                <div className="space-y-2"><Label htmlFor="manual-email">Email</Label><Input id="manual-email" type="email" required autoComplete="off" value={manualEmail} onChange={(event) => setManualEmail(event.target.value)} disabled={manualSubmitting} /></div>
                <div className="space-y-2"><Label htmlFor="manual-name">Full name</Label><Input id="manual-name" value={manualFullName} onChange={(event) => setManualFullName(event.target.value)} disabled={manualSubmitting} /></div>
                <div className="space-y-2"><Label htmlFor="manual-workspace-name">Workspace name</Label><Input id="manual-workspace-name" placeholder="Defaults to the user's name" value={manualWorkspaceName} onChange={(event) => setManualWorkspaceName(event.target.value)} disabled={manualSubmitting} /></div>
                {manualError && <p className="text-sm text-destructive" role="alert">{manualError}</p>}
                <DialogFooter>
                  <Button type="button" variant="outline" disabled={manualSubmitting} onClick={() => setManualOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={manualSubmitting}>
                    {manualSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create workspace &amp; generate password
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(credentialConfirmation)}
        onOpenChange={(open) => { if (!open && !credentialBusyId) setCredentialConfirmation(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{credentialConfirmation?.status === 'active' ? 'Reset owner password?' : 'Replace the temporary password?'}</DialogTitle>
            <DialogDescription>
              {credentialConfirmation?.status === 'active'
                ? `This immediately invalidates the current password for ${credentialConfirmation.email} and signs out existing workspace sessions. The replacement is shown only once and must be changed at next sign-in.`
                : `This immediately invalidates the previous temporary credential for ${credentialConfirmation?.email}. The replacement is shown only once.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={Boolean(credentialBusyId)} onClick={() => setCredentialConfirmation(null)}>Cancel</Button>
            <Button
              disabled={!credentialConfirmation || Boolean(credentialBusyId)}
              onClick={() => credentialConfirmation && void issueOwnerCredential(credentialConfirmation)}
            >
              {credentialBusyId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {credentialConfirmation?.status === 'active' ? 'Reset password' : 'Replace password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite an agency owner</DialogTitle><DialogDescription>Confirm production invite email delivery is configured before sending. The invitee receives a private workspace as its owner and can add their agency team after activation.</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); inviteMutation.mutate() }}>
            <div className="space-y-2"><Label htmlFor="invite-email">Email</Label><Input id="invite-email" type="email" required autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="invite-name">Full name</Label><Input id="invite-name" value={fullName} onChange={(event) => setFullName(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="workspace-name">Workspace name</Label><Input id="workspace-name" placeholder="Defaults to the user's name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button><Button type="submit" disabled={inviteMutation.isPending}>{inviteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send invitation</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) setConfirmation(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{confirmation?.action === 'suspend' ? 'Suspend account?' : confirmation?.action === 'reactivate' ? 'Reactivate account?' : confirmation?.action === 'retry_invite' ? 'Retry invitation?' : confirmation?.action === 'revoke_manual' ? confirmation.user.status === 'revoked' ? 'Finish account deletion?' : 'Delete account?' : confirmation?.user.status === 'revoked' ? 'Finish invitation deletion?' : confirmation && isExpiredInvite(confirmation.user) ? 'Delete expired invitation?' : 'Delete invitation?'}</DialogTitle><DialogDescription>This action applies to {confirmation?.user.email} and their private workspace.</DialogDescription></DialogHeader>
          {confirmation && confirmation.action === 'revoke_pending' && isExpiredInvite(confirmation.user) && (
            <p className="text-sm text-muted-foreground">Expired provider links cannot be resent safely. Delete this account, then create a fresh invitation for the same email. If removal is interrupted, operator review is required.</p>
          )}
          {confirmation?.action === 'revoke_manual' && confirmation.user.status !== 'revoked' && (
            <p className="text-sm text-muted-foreground">This immediately blocks workspace access, removes the dedicated Auth identity, and archives the private workspace. This cannot be undone.</p>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setConfirmation(null)}>Cancel</Button><Button variant={confirmation?.action === 'suspend' || confirmation?.action === 'revoke_pending' || confirmation?.action === 'revoke_manual' ? 'destructive' : 'default'} disabled={statusMutation.isPending} onClick={() => confirmation && statusMutation.mutate(confirmation)}>{statusMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{confirmation?.action === 'revoke_pending' || confirmation?.action === 'revoke_manual' ? 'Delete' : 'Confirm'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspaceLayout>
  )
}

export default WorkspaceUsers
