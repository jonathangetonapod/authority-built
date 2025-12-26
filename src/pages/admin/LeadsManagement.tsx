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
import { Download, Mail, MailOpen, Calendar, Plus, Search, Tag, Loader2, MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/use-toast'

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
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [threadDialogOpen, setThreadDialogOpen] = useState(false)
  const [loadingThread, setLoadingThread] = useState(false)
  const [threadData, setThreadData] = useState<any>(null)

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
  }, [replies, searchTerm, typeFilter, statusFilter, readFilter, dateFilter])

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
    total: replies.length,
    new: replies.filter((r) => r.status === 'new').length,
    sales: replies.filter((r) => r.lead_type === 'sales').length,
    podcasts: replies.filter((r) => r.lead_type === 'podcasts').length,
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
          <div className="flex gap-2">
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
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Replies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">All campaign replies</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">New</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.new}</div>
              <p className="text-xs text-muted-foreground">Uncontacted replies</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sales Leads</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.sales}</div>
              <p className="text-xs text-muted-foreground">Labeled as sales</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Premium Placement Leads</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.podcasts}</div>
              <p className="text-xs text-muted-foreground">Labeled as premium placements</p>
            </CardContent>
          </Card>
        </div>

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

        {/* Replies List */}
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
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
