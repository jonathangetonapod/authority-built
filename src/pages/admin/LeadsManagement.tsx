import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Download, Mail, MailOpen, Calendar, Plus, Search, Tag, Loader2, MessageSquare, Send, Archive, ArchiveRestore, LayoutList, Layers, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/use-toast'
import { LeadSwipeCard } from '@/components/admin/LeadSwipeCard'

interface CampaignReply {
  id: string
  email: string
  name: string | null
  company: string | null
  reply_content: string | null
  campaign_name: string | null
  received_at: string
  lead_type: 'sales' | 'podcasts' | 'other' | null
  status: 'new' | 'contacted' | 'qualified' | 'not_interested' | 'converted'
  notes: string | null
  read: boolean
  bison_reply_id: number | null
  archived: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
}

const LeadsManagement = () => {
  const { toast } = useToast()
  const [replies, setReplies] = useState<CampaignReply[]>([])
  const [filteredReplies, setFilteredReplies] = useState<CampaignReply[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [readFilter, setReadFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [quickFilter, setQuickFilter] = useState<string>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list')
  const [cardIndex, setCardIndex] = useState(0)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true)
  const [smartSyncEnabled, setSmartSyncEnabled] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [threadDialogOpen, setThreadDialogOpen] = useState(false)
  const [loadingThread, setLoadingThread] = useState(false)
  const [threadData, setThreadData] = useState<any>(null)
  const [replyDialogOpen, setReplyDialogOpen] = useState(false)
  const [replyingTo, setReplyingTo] = useState<CampaignReply | null>(null)
  const [replyForm, setReplyForm] = useState({
    to: '',
    subject: '',
    body: '',
  })
  const [sendingReply, setSendingReply] = useState(false)
  const [replyThreadData, setReplyThreadData] = useState<any>(null)
  const [loadingReplyThread, setLoadingReplyThread] = useState(false)

  // New reply form state
  const [newReply, setNewReply] = useState({
    email: '',
    name: '',
    company: '',
    reply_content: '',
    campaign_name: '',
    received_at: new Date().toISOString().split('T')[0],
  })

  useEffect(() => {
    loadReplies()
  }, [])

  useEffect(() => {
    filterReplies()
  }, [replies, searchTerm, typeFilter, statusFilter, readFilter, dateFilter, quickFilter, showArchived])

  // Auto-sync every 5 minutes
  useEffect(() => {
    if (!autoSyncEnabled) return

    const interval = setInterval(() => {
      console.log('[Auto-Sync] Running background sync...')
      handleSync('auto', true) // Silent auto-sync
    }, 5 * 60 * 1000) // 5 minutes

    return () => clearInterval(interval)
  }, [autoSyncEnabled, smartSyncEnabled])

  const loadReplies = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('campaign_replies')
        .select('*')
        .order('received_at', { ascending: false })

      if (error) throw error
      setReplies(data || [])
    } catch (error: any) {
      toast({
        title: 'Error loading replies',
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const filterReplies = () => {
    let filtered = [...replies]

    // Archive filter (apply first - hide archived by default)
    if (!showArchived) {
      filtered = filtered.filter((r) => !r.archived)
    }

    // Quick filter (applies before other filters)
    if (quickFilter !== 'all') {
      switch (quickFilter) {
        case 'needs_reply':
          // New status AND unread
          filtered = filtered.filter((r) => r.status === 'new' && !r.read)
          break
        case 'unread':
          // All unread
          filtered = filtered.filter((r) => !r.read)
          break
        case 'contacted':
          // Status = contacted
          filtered = filtered.filter((r) => r.status === 'contacted')
          break
        case 'qualified':
          // Status = qualified
          filtered = filtered.filter((r) => r.status === 'qualified')
          break
        case 'unlabeled':
          // No lead type assigned
          filtered = filtered.filter((r) => !r.lead_type)
          break
        case 'archived':
          // Only archived
          filtered = filtered.filter((r) => r.archived)
          break
      }
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (r) =>
          r.email?.toLowerCase().includes(term) ||
          r.name?.toLowerCase().includes(term) ||
          r.company?.toLowerCase().includes(term) ||
          r.campaign_name?.toLowerCase().includes(term)
      )
    }

    // Type filter
    if (typeFilter !== 'all') {
      if (typeFilter === 'unlabeled') {
        filtered = filtered.filter((r) => !r.lead_type)
      } else {
        filtered = filtered.filter((r) => r.lead_type === typeFilter)
      }
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((r) => r.status === statusFilter)
    }

    // Read filter
    if (readFilter !== 'all') {
      if (readFilter === 'unread') {
        filtered = filtered.filter((r) => !r.read)
      } else if (readFilter === 'read') {
        filtered = filtered.filter((r) => r.read)
      }
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

      filtered = filtered.filter((r) => {
        const replyDate = new Date(r.received_at)

        switch (dateFilter) {
          case 'today':
            return replyDate >= today
          case 'yesterday':
            const yesterday = new Date(today)
            yesterday.setDate(yesterday.getDate() - 1)
            return replyDate >= yesterday && replyDate < today
          case 'last7days':
            const last7days = new Date(today)
            last7days.setDate(last7days.getDate() - 7)
            return replyDate >= last7days
          case 'last30days':
            const last30days = new Date(today)
            last30days.setDate(last30days.getDate() - 30)
            return replyDate >= last30days
          case 'thisMonth':
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
            return replyDate >= startOfMonth
          case 'lastMonth':
            const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
            const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 1)
            return replyDate >= startOfLastMonth && replyDate < endOfLastMonth
          default:
            return true
        }
      })
    }

    setFilteredReplies(filtered)
  }

  const handleAddReply = async () => {
    try {
      const { error } = await supabase.from('campaign_replies').insert([
        {
          ...newReply,
          received_at: new Date(newReply.received_at).toISOString(),
        },
      ])

      if (error) throw error

      toast({
        title: 'Reply added',
        description: 'Campaign reply has been added successfully',
      })

      setAddDialogOpen(false)
      setNewReply({
        email: '',
        name: '',
        company: '',
        reply_content: '',
        campaign_name: '',
        received_at: new Date().toISOString().split('T')[0],
      })
      loadReplies()
    } catch (error: any) {
      toast({
        title: 'Error adding reply',
        description: error.message,
        variant: 'destructive',
      })
    }
  }

  const updateLeadType = async (id: string, leadType: 'sales' | 'podcasts' | 'other') => {
    try {
      setUpdatingId(id)
      const { error } = await supabase
        .from('campaign_replies')
        .update({ lead_type: leadType })
        .eq('id', id)

      if (error) throw error

      // Update local state instead of refetching
      setReplies(prevReplies =>
        prevReplies.map(reply =>
          reply.id === id ? { ...reply, lead_type: leadType } : reply
        )
      )

      const typeLabels: Record<string, string> = {
        sales: 'sales',
        podcasts: 'premium placement',
        other: 'other'
      }
      toast({
        title: 'Lead type updated',
        description: `Marked as ${typeLabels[leadType] || leadType}`,
      })
    } catch (error: any) {
      toast({
        title: 'Error updating lead type',
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setUpdatingId(null)
    }
  }

  const updateStatus = async (id: string, status: CampaignReply['status']) => {
    try {
      setUpdatingId(id)
      const { error } = await supabase
        .from('campaign_replies')
        .update({ status })
        .eq('id', id)

      if (error) throw error

      // Update local state instead of refetching
      setReplies(prevReplies =>
        prevReplies.map(reply =>
          reply.id === id ? { ...reply, status } : reply
        )
      )

      toast({
        title: 'Status updated',
        description: `Marked as ${status.replace('_', ' ')}`,
      })
    } catch (error: any) {
      toast({
        title: 'Error updating status',
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setUpdatingId(null)
    }
  }

  const toggleRead = async (id: string, currentReadStatus: boolean) => {
    try {
      setUpdatingId(id)
      const { error } = await supabase
        .from('campaign_replies')
        .update({ read: !currentReadStatus })
        .eq('id', id)

      if (error) throw error

      // Update local state instead of refetching
      setReplies(prevReplies =>
        prevReplies.map(reply =>
          reply.id === id ? { ...reply, read: !currentReadStatus } : reply
        )
      )

      toast({
        title: !currentReadStatus ? 'Marked as read' : 'Marked as unread',
      })
    } catch (error: any) {
      toast({
        title: 'Error updating read status',
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setUpdatingId(null)
    }
  }

  const toggleArchive = async (id: string, currentArchivedStatus: boolean) => {
    try {
      setUpdatingId(id)
      const { error } = await supabase
        .from('campaign_replies')
        .update({
          archived: !currentArchivedStatus,
          archived_at: !currentArchivedStatus ? new Date().toISOString() : null
        })
        .eq('id', id)

      if (error) throw error

      // Update local state instead of refetching
      setReplies(prevReplies =>
        prevReplies.map(reply =>
          reply.id === id ? {
            ...reply,
            archived: !currentArchivedStatus,
            archived_at: !currentArchivedStatus ? new Date().toISOString() : null
          } : reply
        )
      )

      toast({
        title: !currentArchivedStatus ? 'Archived' : 'Unarchived',
        description: !currentArchivedStatus ? 'Lead moved to archive' : 'Lead restored from archive',
      })
    } catch (error: any) {
      toast({
        title: 'Error updating archive status',
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setUpdatingId(null)
    }
  }

  const fetchEmailThread = async (bisonReplyId: number) => {
    try {
      setLoadingThread(true)
      setThreadDialogOpen(true)

      const { data, error } = await supabase.functions.invoke('fetch-email-thread', {
        body: { replyId: bisonReplyId },
      })

      if (error) throw error

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch email thread')
      }

      setThreadData(data.data)
    } catch (error: any) {
      toast({
        title: 'Error fetching email thread',
        description: error.message,
        variant: 'destructive',
      })
      setThreadDialogOpen(false)
    } finally {
      setLoadingThread(false)
    }
  }

  const openReplyDialog = async (reply: CampaignReply) => {
    setReplyingTo(reply)
    setReplyForm({
      to: reply.email,
      subject: reply.campaign_name ? `Re: ${reply.campaign_name}` : 'Re: Your Interest',
      body: '',
    })
    setReplyDialogOpen(true)
    setReplyThreadData(null)

    // Fetch latest thread if we have a bison_reply_id
    if (reply.bison_reply_id) {
      try {
        setLoadingReplyThread(true)

        toast({
          title: 'Fetching latest messages...',
          description: 'Loading conversation thread',
        })

        const { data, error } = await supabase.functions.invoke('fetch-email-thread', {
          body: { replyId: reply.bison_reply_id },
        })

        if (error) throw error

        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch email thread')
        }

        setReplyThreadData(data.data)

        toast({
          title: 'Thread loaded!',
          description: 'You can now see the latest messages',
        })
      } catch (error: any) {
        console.error('Error fetching thread for reply:', error)
        toast({
          title: 'Could not load thread',
          description: 'Continuing without thread context',
          variant: 'destructive',
        })
      } finally {
        setLoadingReplyThread(false)
      }
    }
  }

  const handleSendReply = async () => {
    if (!replyingTo?.bison_reply_id) {
      toast({
        title: 'Cannot send reply',
        description: 'This lead does not have a Bison reply ID. Only leads from Email Bison can receive replies.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSendingReply(true)

      // Call edge function to send reply via Email Bison
      const { data, error } = await supabase.functions.invoke('send-reply', {
        body: {
          bisonReplyId: replyingTo.bison_reply_id,
          message: replyForm.body,
          subject: replyForm.subject,
        },
      })

      if (error) throw error

      if (!data.success) {
        throw new Error(data.error || 'Failed to send reply')
      }

      toast({
        title: 'Reply Sent!',
        description: `Your reply to ${replyForm.to} has been sent successfully.`,
      })

      // Mark as contacted
      if (replyingTo) {
        await updateStatus(replyingTo.id, 'contacted')
      }

      // Close dialog and reset
      setReplyDialogOpen(false)
      setReplyingTo(null)
      setReplyForm({ to: '', subject: '', body: '' })
      setReplyThreadData(null)
    } catch (error: any) {
      toast({
        title: 'Error sending reply',
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setSendingReply(false)
    }
  }

  const applyQuickFilter = (filter: string) => {
    setQuickFilter(filter)
    // Reset other filters when applying quick filter
    if (filter !== 'all') {
      setTypeFilter('all')
      setStatusFilter('all')
      setReadFilter('all')
    }
    // If viewing archived, enable showArchived
    if (filter === 'archived') {
      setShowArchived(true)
    }
  }

  // Swipe card handlers
  const handleSwipeLeft = async (reply: CampaignReply) => {
    // Archive
    await toggleArchive(reply.id, reply.archived)
    // Move to next card
    if (cardIndex < filteredReplies.length - 1) {
      setCardIndex(cardIndex + 1)
    }
  }

  const handleSwipeRight = async (reply: CampaignReply) => {
    // Mark as qualified
    await updateStatus(reply.id, 'qualified')
    // Move to next card
    if (cardIndex < filteredReplies.length - 1) {
      setCardIndex(cardIndex + 1)
    }
  }

  const handleSwipeUp = (reply: CampaignReply) => {
    // Open reply dialog
    openReplyDialog(reply)
  }

  const handleSwipeDown = (reply: CampaignReply) => {
    // View thread
    if (reply.bison_reply_id) {
      fetchEmailThread(reply.bison_reply_id)
    }
  }

  const handleNextCard = () => {
    if (cardIndex < filteredReplies.length - 1) {
      setCardIndex(cardIndex + 1)
    }
  }

  const handlePreviousCard = () => {
    if (cardIndex > 0) {
      setCardIndex(cardIndex - 1)
    }
  }

  const handleMarkAsSales = async (reply: CampaignReply) => {
    await updateLeadType(reply.id, 'sales')
  }

  const handleMarkAsPremium = async (reply: CampaignReply) => {
    await updateLeadType(reply.id, 'podcasts')
  }

  const handleSync = async (syncType: 'manual' | 'auto' = 'manual', silent = false) => {
    try {
      setSyncing(true)

      if (!silent) {
        toast({
          title: 'Syncing...',
          description: 'Checking Email Bison for new replies',
        })
      }

      const { data, error } = await supabase.functions.invoke('sync-replies', {
        body: {
          syncType: syncType,
          unreadOnly: smartSyncEnabled,
        },
      })

      if (error) throw error

      if (!data.success) {
        throw new Error(data.error || 'Sync failed')
      }

      const { new_replies, updated_replies, total_processed, sync_duration_ms } = data.data

      // Update last sync time
      setLastSyncTime(new Date())

      // Reload replies to show new ones (but only if there are new/updated)
      if (new_replies > 0 || updated_replies > 0) {
        await loadReplies()
      }

      // Show toast for manual syncs or if there are new replies
      if (!silent || new_replies > 0) {
        toast({
          title: syncType === 'auto' ? 'Auto-Sync Complete!' : 'Sync Complete!',
          description: `${new_replies} new, ${updated_replies} updated (${Math.round(sync_duration_ms / 1000)}s)`,
        })
      }
    } catch (error: any) {
      // Only show error toast for manual syncs
      if (!silent) {
        toast({
          title: 'Sync Failed',
          description: error.message,
          variant: 'destructive',
        })
      }
      console.error('[Sync Error]', error)
    } finally {
      setSyncing(false)
    }
  }

  const exportCSV = () => {
    const headers = ['Email', 'Name', 'Company', 'Campaign', 'Lead Type', 'Status', 'Received At']
    const rows = filteredReplies.map((r) => [
      r.email,
      r.name || '',
      r.company || '',
      r.campaign_name || '',
      r.lead_type || '',
      r.status,
      new Date(r.received_at).toLocaleDateString(),
    ])

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `campaign-replies-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const getStatusBadge = (status: CampaignReply['status']) => {
    const variants: Record<string, any> = {
      new: { variant: 'default', label: 'New' },
      contacted: { variant: 'secondary', label: 'Contacted' },
      qualified: { variant: 'default', label: 'Qualified' },
      not_interested: { variant: 'destructive', label: 'Not Interested' },
      converted: { variant: 'default', label: 'Converted' },
    }
    const config = variants[status] || variants.new
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  const getLeadTypeBadge = (leadType: string | null) => {
    if (!leadType) return <Badge variant="outline">Unlabeled</Badge>

    const variants: Record<string, any> = {
      sales: { variant: 'default', label: 'Sales', className: 'bg-blue-500' },
      podcasts: { variant: 'default', label: 'Premium Placement', className: 'bg-purple-500' },
      other: { variant: 'outline', label: 'Other' },
    }
    const config = variants[leadType] || variants.other
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>
  }

  // Calculate stats
  const stats = {
    total: replies.filter((r) => !r.archived).length,
    needsReply: replies.filter((r) => r.status === 'new' && !r.read && !r.archived).length,
    unread: replies.filter((r) => !r.read && !r.archived).length,
    contacted: replies.filter((r) => r.status === 'contacted' && !r.archived).length,
    qualified: replies.filter((r) => r.status === 'qualified' && !r.archived).length,
    archived: replies.filter((r) => r.archived).length,
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Campaign Replies</h1>
            <p className="text-muted-foreground mt-2">
              Track and label email campaign replies
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex flex-col items-end mr-2">
              {lastSyncTime && (
                <span className="text-xs text-muted-foreground">
                  Last sync: {lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <div className="flex gap-2 mt-1">
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSyncEnabled}
                    onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-muted-foreground">Auto-sync (5min)</span>
                </label>
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smartSyncEnabled}
                    onChange={(e) => setSmartSyncEnabled(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-muted-foreground">Unread only</span>
                </label>
              </div>
            </div>
            <Button
              onClick={() => handleSync('manual')}
              variant="outline"
              disabled={syncing}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync'}
            </Button>
            <Button
              onClick={() => {
                setViewMode(viewMode === 'list' ? 'cards' : 'list')
                setCardIndex(0)
              }}
              variant="outline"
            >
              {viewMode === 'list' ? (
                <>
                  <Layers className="mr-2 h-4 w-4" />
                  Card View
                </>
              ) : (
                <>
                  <LayoutList className="mr-2 h-4 w-4" />
                  List View
                </>
              )}
            </Button>
            <Button onClick={exportCSV} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Reply
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add Campaign Reply</DialogTitle>
                  <DialogDescription>
                    Manually add a reply from your email campaigns
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newReply.email}
                        onChange={(e) => setNewReply({ ...newReply, email: e.target.value })}
                        placeholder="contact@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        value={newReply.name}
                        onChange={(e) => setNewReply({ ...newReply, name: e.target.value })}
                        placeholder="John Doe"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="company">Company</Label>
                      <Input
                        id="company"
                        value={newReply.company}
                        onChange={(e) => setNewReply({ ...newReply, company: e.target.value })}
                        placeholder="Acme Inc"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="campaign">Campaign Name</Label>
                      <Input
                        id="campaign"
                        value={newReply.campaign_name}
                        onChange={(e) => setNewReply({ ...newReply, campaign_name: e.target.value })}
                        placeholder="Q1 Outreach"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="received_at">Received Date</Label>
                    <Input
                      id="received_at"
                      type="date"
                      value={newReply.received_at}
                      onChange={(e) => setNewReply({ ...newReply, received_at: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reply">Reply Content</Label>
                    <Textarea
                      id="reply"
                      value={newReply.reply_content}
                      onChange={(e) => setNewReply({ ...newReply, reply_content: e.target.value })}
                      placeholder="The email reply content..."
                      rows={4}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddReply} disabled={!newReply.email}>
                    Add Reply
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Not archived</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => applyQuickFilter('needs_reply')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Needs Reply</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">{stats.needsReply}</div>
              <p className="text-xs text-muted-foreground">New & unread</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => applyQuickFilter('unread')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unread</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-500">{stats.unread}</div>
              <p className="text-xs text-muted-foreground">Not yet read</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => applyQuickFilter('contacted')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Contacted</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.contacted}</div>
              <p className="text-xs text-muted-foreground">Replied to</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => applyQuickFilter('qualified')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Qualified</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{stats.qualified}</div>
              <p className="text-xs text-muted-foreground">Hot leads</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => applyQuickFilter('archived')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Archived</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">{stats.archived}</div>
              <p className="text-xs text-muted-foreground">Done/closed</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Filters */}
        {quickFilter !== 'all' && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="text-xs">
                    Quick Filter Active
                  </Badge>
                  <span className="text-sm font-medium">
                    {quickFilter === 'needs_reply' && 'Needs Reply'}
                    {quickFilter === 'unread' && 'Unread'}
                    {quickFilter === 'contacted' && 'Contacted'}
                    {quickFilter === 'qualified' && 'Qualified'}
                    {quickFilter === 'unlabeled' && 'Unlabeled'}
                    {quickFilter === 'archived' && 'Archived'}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => applyQuickFilter('all')}
                  className="text-xs"
                >
                  Clear Filter
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by email, name, company, or campaign..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Lead Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="unlabeled">Unlabeled Only</SelectItem>
                    <SelectItem value="sales">Sales Only</SelectItem>
                    <SelectItem value="podcasts">Premium Placements Only</SelectItem>
                    <SelectItem value="other">Other Only</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="qualified">Qualified</SelectItem>
                    <SelectItem value="not_interested">Not Interested</SelectItem>
                    <SelectItem value="converted">Converted</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={readFilter} onValueChange={setReadFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Read Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="unread">Unread Only</SelectItem>
                    <SelectItem value="read">Read Only</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Date Range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="last7days">Last 7 Days</SelectItem>
                    <SelectItem value="last30days">Last 30 Days</SelectItem>
                    <SelectItem value="thisMonth">This Month</SelectItem>
                    <SelectItem value="lastMonth">Last Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card View */}
        {viewMode === 'cards' && !loading && filteredReplies.length > 0 && (
          <Card>
            <CardContent className="p-8">
              <LeadSwipeCard
                replies={filteredReplies}
                currentIndex={cardIndex}
                onSwipeLeft={handleSwipeLeft}
                onSwipeRight={handleSwipeRight}
                onSwipeUp={handleSwipeUp}
                onSwipeDown={handleSwipeDown}
                onMarkAsSales={handleMarkAsSales}
                onMarkAsPremium={handleMarkAsPremium}
                onNext={handleNextCard}
                onPrevious={handlePreviousCard}
              />
            </CardContent>
          </Card>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <Card>
            <CardHeader>
              <CardTitle>Replies ({filteredReplies.length})</CardTitle>
              <CardDescription>
                Latest campaign replies from Instantly and other platforms
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredReplies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No replies found. Add your first reply to get started.
                </div>
                ) : (
                <div className="space-y-4">
                  {filteredReplies.map((reply) => (
                  <div
                    key={reply.id}
                    className={`p-4 border rounded-lg hover:bg-muted/50 transition-colors ${!reply.read ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          {reply.read ? (
                            <MailOpen className="h-5 w-5 text-primary" />
                          ) : (
                            <Mail className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className={reply.read ? 'font-medium' : 'font-bold'}>{reply.email}</p>
                            {reply.name && (
                              <span className="text-sm text-muted-foreground">• {reply.name}</span>
                            )}
                          </div>
                          {reply.company && (
                            <p className="text-sm text-muted-foreground mb-2">{reply.company}</p>
                          )}
                          {reply.reply_content && (
                            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                              {reply.reply_content}
                            </p>
                          )}
                          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(reply.received_at).toLocaleDateString()}
                            </span>
                            {reply.campaign_name && (
                              <>
                                <span>•</span>
                                <span>{reply.campaign_name}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 ml-4 min-w-[280px]">
                        {/* Status Badges */}
                        <div className="flex gap-2 items-center">
                          {getLeadTypeBadge(reply.lead_type)}
                          {getStatusBadge(reply.status)}
                        </div>

                        {/* Label As Section */}
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Label As</p>
                          <div className="flex gap-1.5">
                            {updatingId === reply.id ? (
                              <div className="flex items-center justify-center w-full py-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                              </div>
                            ) : (
                              <>
                                <Button
                                  type="button"
                                  variant={reply.lead_type === 'sales' ? 'default' : 'outline'}
                                  size="sm"
                                  onClick={() => updateLeadType(reply.id, 'sales')}
                                  className="text-xs flex-1"
                                >
                                  Sales
                                </Button>
                                <Button
                                  type="button"
                                  variant={reply.lead_type === 'podcasts' ? 'default' : 'outline'}
                                  size="sm"
                                  onClick={() => updateLeadType(reply.id, 'podcasts')}
                                  className="text-xs flex-1"
                                >
                                  Premium
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Status Dropdown */}
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</p>
                          <Select
                            value={reply.status}
                            onValueChange={(value) => updateStatus(reply.id, value as CampaignReply['status'])}
                          >
                            <SelectTrigger className="w-full h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="new">New</SelectItem>
                              <SelectItem value="contacted">Contacted</SelectItem>
                              <SelectItem value="qualified">Qualified</SelectItem>
                              <SelectItem value="not_interested">Not Interested</SelectItem>
                              <SelectItem value="converted">Converted</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1.5 pt-2 border-t">
                          {reply.bison_reply_id ? (
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              onClick={() => openReplyDialog(reply)}
                              className="text-xs w-full"
                            >
                              <Send className="h-3 w-3 mr-1.5" />
                              Reply
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled
                              className="text-xs w-full opacity-50 cursor-not-allowed"
                              title="Reply not available - no Email Bison thread"
                            >
                              <Send className="h-3 w-3 mr-1.5" />
                              Reply (N/A)
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => toggleRead(reply.id, reply.read)}
                            className="text-xs w-full"
                          >
                            {reply.read ? (
                              <>
                                <Mail className="h-3 w-3 mr-1.5" />
                                Mark Unread
                              </>
                            ) : (
                              <>
                                <MailOpen className="h-3 w-3 mr-1.5" />
                                Mark Read
                              </>
                            )}
                          </Button>
                          {reply.bison_reply_id && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => fetchEmailThread(reply.bison_reply_id!)}
                              className="text-xs w-full"
                            >
                              <MessageSquare className="h-3 w-3 mr-1.5" />
                              View Thread
                            </Button>
                          )}
                          <div className="pt-2 border-t">
                            <Button
                              type="button"
                              variant={reply.archived ? "default" : "ghost"}
                              size="sm"
                              onClick={() => toggleArchive(reply.id, reply.archived)}
                              className="text-xs w-full"
                            >
                              {reply.archived ? (
                                <>
                                  <ArchiveRestore className="h-3 w-3 mr-1.5" />
                                  Unarchive
                                </>
                              ) : (
                                <>
                                  <Archive className="h-3 w-3 mr-1.5" />
                                  Archive
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Reply Dialog */}
        <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader className="border-b pb-4">
              <DialogTitle className="text-2xl flex items-center gap-2">
                <Send className="h-6 w-6 text-primary" />
                Compose Reply
              </DialogTitle>
              <DialogDescription>
                Reply to {replyingTo?.name || replyingTo?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto pr-2 space-y-6 py-4">
              {/* Loading Thread */}
              {loadingReplyThread && (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
                  <p className="text-sm font-medium">Fetching latest messages...</p>
                  <p className="text-xs text-muted-foreground">Loading conversation thread</p>
                </div>
              )}

              {/* Email Thread Context */}
              {!loadingReplyThread && replyThreadData?.data && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Conversation Thread</p>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto border rounded-lg p-4 bg-muted/20">
                    {/* Older Messages */}
                    {replyThreadData.data.older_messages?.map((msg: any, index: number) => (
                      <Card key={msg.id} className="bg-background/50">
                        <CardContent className="pt-3 pb-3">
                          <div className="flex items-start gap-2 mb-2">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                              {(msg.from_name || msg.from_email_address).charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-semibold text-sm truncate">{msg.from_name || 'Unknown'}</p>
                                <p className="text-xs text-muted-foreground whitespace-nowrap">
                                  {new Date(msg.date_received).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </p>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{msg.from_email_address}</p>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground line-clamp-2 pl-10">
                            {msg.text_body?.substring(0, 150) || 'No preview available'}
                          </div>
                        </CardContent>
                      </Card>
                    ))}

                    {/* Current Reply - Highlighted */}
                    {replyThreadData.data.current_reply && (
                      <Card className="border-primary/50 bg-primary/5">
                        <CardContent className="pt-3 pb-3">
                          <div className="flex items-start gap-2 mb-2">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 ring-2 ring-primary/30">
                              {(replyThreadData.data.current_reply.from_name || replyThreadData.data.current_reply.from_email_address).charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-sm truncate">{replyThreadData.data.current_reply.from_name || 'Unknown'}</p>
                                  <Badge variant="default" className="text-[10px] px-1 py-0">Latest</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground whitespace-nowrap">
                                  {new Date(replyThreadData.data.current_reply.date_received).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </p>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{replyThreadData.data.current_reply.from_email_address}</p>
                            </div>
                          </div>
                          <div className="text-xs pl-10 line-clamp-3">
                            {replyThreadData.data.current_reply.text_body || 'No preview available'}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Newer Messages */}
                    {replyThreadData.data.newer_messages?.map((msg: any) => (
                      <Card key={msg.id} className="bg-background/50">
                        <CardContent className="pt-3 pb-3">
                          <div className="flex items-start gap-2 mb-2">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-green-400 to-emerald-400 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                              {(msg.from_name || msg.from_email_address).charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-semibold text-sm truncate">{msg.from_name || 'Unknown'}</p>
                                <p className="text-xs text-muted-foreground whitespace-nowrap">
                                  {new Date(msg.date_received).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </p>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{msg.from_email_address}</p>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground line-clamp-2 pl-10">
                            {msg.text_body?.substring(0, 150) || 'No preview available'}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Original Message Context (Fallback if no thread) */}
              {!loadingReplyThread && !replyThreadData && replyingTo && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Original Message</p>
                  <Card className="bg-muted/30">
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                          {(replyingTo.name || replyingTo.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold">{replyingTo.name || 'Unknown'}</p>
                          <p className="text-sm text-muted-foreground">{replyingTo.email}</p>
                          {replyingTo.company && (
                            <p className="text-xs text-muted-foreground">{replyingTo.company}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            {new Date(replyingTo.received_at).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(replyingTo.received_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className="pl-13">
                        <p className="text-sm whitespace-pre-wrap">{replyingTo.reply_content}</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Compose Form */}
              {!loadingReplyThread && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Your Reply</p>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="reply-to">To</Label>
                      <Input
                        id="reply-to"
                        type="email"
                        value={replyForm.to}
                        onChange={(e) => setReplyForm({ ...replyForm, to: e.target.value })}
                        placeholder="recipient@example.com"
                        disabled
                        className="bg-muted/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reply-subject">Subject</Label>
                      <Input
                        id="reply-subject"
                        value={replyForm.subject}
                        onChange={(e) => setReplyForm({ ...replyForm, subject: e.target.value })}
                        placeholder="Email subject"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reply-body">Message</Label>
                      <Textarea
                        id="reply-body"
                        value={replyForm.body}
                        onChange={(e) => setReplyForm({ ...replyForm, body: e.target.value })}
                        placeholder="Type your reply here..."
                        rows={12}
                        className="resize-none"
                      />
                      <p className="text-xs text-muted-foreground">
                        {replyForm.body.length} characters
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setReplyDialogOpen(false)}
                disabled={sendingReply || loadingReplyThread}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSendReply}
                disabled={!replyForm.body.trim() || sendingReply || loadingReplyThread}
              >
                {sendingReply ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Reply
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Email Thread Modal */}
        <Dialog open={threadDialogOpen} onOpenChange={setThreadDialogOpen}>
          <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader className="border-b pb-4">
              <DialogTitle className="text-2xl flex items-center gap-2">
                <MessageSquare className="h-6 w-6 text-primary" />
                Email Conversation
              </DialogTitle>
              <DialogDescription>
                Full email thread with context
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto pr-2">
              {loadingThread ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                  <p className="text-sm text-muted-foreground">Loading conversation...</p>
                </div>
              ) : threadData ? (
                <div className="space-y-6 py-4">
                  {/* Older Messages */}
                  {threadData.data?.older_messages && threadData.data.older_messages.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-border"></div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Earlier in thread</span>
                        <div className="h-px flex-1 bg-border"></div>
                      </div>
                      {threadData.data.older_messages.map((msg: any, index: number) => (
                        <div key={msg.id} className="relative pl-8">
                          <div className="absolute left-0 top-0 bottom-0 w-px bg-border"></div>
                          <div className="absolute left-0 top-6 w-2 h-2 rounded-full bg-muted-foreground"></div>
                          <Card className="hover:shadow-md transition-shadow">
                            <CardHeader className="pb-3">
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                                    {(msg.from_name || msg.from_email_address).charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-base">{msg.from_name || 'Unknown'}</p>
                                    <p className="text-sm text-muted-foreground">{msg.from_email_address}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(msg.date_received).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(msg.date_received).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                  </p>
                                </div>
                              </div>
                              {msg.subject && (
                                <div className="mt-3 pt-3 border-t">
                                  <p className="text-sm font-medium text-muted-foreground">Re: {msg.subject}</p>
                                </div>
                              )}
                            </CardHeader>
                            <CardContent>
                              <div
                                className="prose prose-sm max-w-none dark:prose-invert [&>p]:my-2 [&>div]:my-2"
                                dangerouslySetInnerHTML={{ __html: msg.html_body || `<p>${msg.text_body}</p>` }}
                              />
                            </CardContent>
                          </Card>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Current Reply - Highlighted */}
                  {threadData.data?.current_reply && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-primary/30"></div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Current Reply
                        </span>
                        <div className="h-px flex-1 bg-primary/30"></div>
                      </div>
                      <div className="relative pl-8">
                        <div className="absolute left-0 top-0 bottom-0 w-px bg-primary"></div>
                        <div className="absolute left-0 top-6 w-3 h-3 rounded-full bg-primary ring-4 ring-primary/20"></div>
                        <Card className="border-primary/50 bg-primary/5 shadow-lg">
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white font-semibold text-lg ring-4 ring-primary/20">
                                  {(threadData.data.current_reply.from_name || threadData.data.current_reply.from_email_address).charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-bold text-lg">{threadData.data.current_reply.from_name || 'Unknown'}</p>
                                  <p className="text-sm text-muted-foreground">{threadData.data.current_reply.from_email_address}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <Badge variant="default" className="mb-1">Latest</Badge>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(threadData.data.current_reply.date_received).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(threadData.data.current_reply.date_received).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                            {threadData.data.current_reply.subject && (
                              <div className="mt-3 pt-3 border-t">
                                <p className="text-sm font-medium">Re: {threadData.data.current_reply.subject}</p>
                              </div>
                            )}
                          </CardHeader>
                          <CardContent>
                            <div
                              className="prose prose-sm max-w-none dark:prose-invert [&>p]:my-2 [&>div]:my-2"
                              dangerouslySetInnerHTML={{ __html: threadData.data.current_reply.html_body || `<p>${threadData.data.current_reply.text_body}</p>` }}
                            />
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  )}

                  {/* Newer Messages */}
                  {threadData.data?.newer_messages && threadData.data.newer_messages.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-border"></div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Follow-up</span>
                        <div className="h-px flex-1 bg-border"></div>
                      </div>
                      {threadData.data.newer_messages.map((msg: any) => (
                        <div key={msg.id} className="relative pl-8">
                          <div className="absolute left-0 top-0 bottom-0 w-px bg-border"></div>
                          <div className="absolute left-0 top-6 w-2 h-2 rounded-full bg-muted-foreground"></div>
                          <Card className="hover:shadow-md transition-shadow">
                            <CardHeader className="pb-3">
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-white font-semibold">
                                    {(msg.from_name || msg.from_email_address).charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-base">{msg.from_name || 'Unknown'}</p>
                                    <p className="text-sm text-muted-foreground">{msg.from_email_address}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(msg.date_received).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(msg.date_received).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                  </p>
                                </div>
                              </div>
                              {msg.subject && (
                                <div className="mt-3 pt-3 border-t">
                                  <p className="text-sm font-medium text-muted-foreground">Re: {msg.subject}</p>
                                </div>
                              )}
                            </CardHeader>
                            <CardContent>
                              <div
                                className="prose prose-sm max-w-none dark:prose-invert [&>p]:my-2 [&>div]:my-2"
                                dangerouslySetInnerHTML={{ __html: msg.html_body || `<p>${msg.text_body}</p>` }}
                              />
                            </CardContent>
                          </Card>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16">
                  <MessageSquare className="h-16 w-16 text-muted-foreground/30 mb-4" />
                  <p className="text-center text-muted-foreground">No thread data available</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}

export default LeadsManagement
