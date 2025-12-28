import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, Plus, Users, TrendingUp, CheckCircle2, Clock, Loader2, ChevronLeft, ChevronRight, Unlock, Lock } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { getClients, createClient } from '@/services/clients'
import { getBookings, getClientBookingStats } from '@/services/bookings'

export default function ClientsManagement() {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [activeTab, setActiveTab] = useState('all')
  const [newClientForm, setNewClientForm] = useState({
    name: '',
    email: '',
    contact_person: '',
    linkedin_url: '',
    website: '',
    status: 'active' as const,
    notes: ''
  })

  const queryClient = useQueryClient()

  const selectedMonth = selectedDate.getMonth()
  const selectedYear = selectedDate.getFullYear()
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  // Fetch clients
  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getClients()
  })

  // Fetch all bookings for stats
  const { data: bookingsData, isLoading: bookingsLoading } = useQuery({
    queryKey: ['bookings', 'all'],
    queryFn: () => getBookings()
  })

  // Create client mutation
  const createClientMutation = useMutation({
    mutationFn: createClient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      setIsAddModalOpen(false)
      setNewClientForm({
        name: '',
        email: '',
        contact_person: '',
        linkedin_url: '',
        website: '',
        status: 'active',
        notes: ''
      })
    }
  })

  const clients = clientsData?.clients || []
  const allBookings = bookingsData?.bookings || []

  // Filter bookings by selected month
  const bookingsInSelectedMonth = allBookings.filter(booking => {
    if (!booking.scheduled_date) return false
    const bookingDate = new Date(booking.scheduled_date)
    return bookingDate.getMonth() === selectedMonth && bookingDate.getFullYear() === selectedYear
  })

  // Calculate client stats for selected month
  const clientsWithStats = clients.map(client => {
    // Get all bookings for this client in the selected month
    const clientBookingsInMonth = bookingsInSelectedMonth.filter(b => b.client_id === client.id)

    // Get last booking in the selected month
    const lastBookingInMonth = clientBookingsInMonth
      .filter(b => b.scheduled_date)
      .sort((a, b) => new Date(b.scheduled_date!).getTime() - new Date(a.scheduled_date!).getTime())[0]

    return {
      ...client,
      totalBookings: clientBookingsInMonth.length,
      bookedCount: clientBookingsInMonth.filter(b => b.status === 'booked').length,
      inProgressCount: clientBookingsInMonth.filter(b => b.status === 'in_progress').length,
      recordedCount: clientBookingsInMonth.filter(b => b.status === 'recorded').length,
      publishedCount: clientBookingsInMonth.filter(b => b.status === 'published').length,
      lastBookingDate: lastBookingInMonth?.scheduled_date || null
    }
  })

  // Calculate stats for ALL clients (not filtered by month)
  const allClientsWithStats = clients.map(client => {
    // Get all bookings for this client (regardless of month)
    const clientBookings = allBookings.filter(b => b.client_id === client.id)

    // Get last booking overall
    const lastBooking = clientBookings
      .filter(b => b.scheduled_date)
      .sort((a, b) => new Date(b.scheduled_date!).getTime() - new Date(a.scheduled_date!).getTime())[0]

    return {
      ...client,
      totalBookings: clientBookings.length,
      bookedCount: clientBookings.filter(b => b.status === 'booked').length,
      inProgressCount: clientBookings.filter(b => b.status === 'in_progress').length,
      recordedCount: clientBookings.filter(b => b.status === 'recorded').length,
      publishedCount: clientBookings.filter(b => b.status === 'published').length,
      lastBookingDate: lastBooking?.scheduled_date || null
    }
  })

  const filteredClients = clientsWithStats.filter(client => {
    const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesStatus = statusFilter === 'all' || client.status === statusFilter
    const hasBookingsInMonth = client.totalBookings > 0 // Only show clients with bookings in selected month
    return matchesSearch && matchesStatus && hasBookingsInMonth
  })

  const filteredAllClients = allClientsWithStats.filter(client => {
    const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesStatus = statusFilter === 'all' || client.status === statusFilter
    return matchesSearch && matchesStatus
  })

  // Get clients active in selected month (clients with bookings in that month)
  const clientIdsInMonth = new Set(bookingsInSelectedMonth.map(b => b.client_id))
  const activeClientsInMonth = clients.filter(c => clientIdsInMonth.has(c.id)).length

  const totalBookingsInMonth = bookingsInSelectedMonth.length
  const inProgressInMonth = bookingsInSelectedMonth.filter(b => b.status === 'in_progress').length
  const bookedInMonth = bookingsInSelectedMonth.filter(b => b.status === 'booked').length
  const recordedInMonth = bookingsInSelectedMonth.filter(b => b.status === 'recorded').length
  const publishedInMonth = bookingsInSelectedMonth.filter(b => b.status === 'published').length

  const goToPreviousMonth = () => {
    setSelectedDate(new Date(selectedYear, selectedMonth - 1, 1))
  }

  const goToNextMonth = () => {
    setSelectedDate(new Date(selectedYear, selectedMonth + 1, 1))
  }

  const goToThisMonth = () => {
    setSelectedDate(new Date())
  }

  const handleCreateClient = () => {
    if (!newClientForm.name) return
    createClientMutation.mutate(newClientForm)
  }

  if (clientsLoading || bookingsLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    )
  }

  const getStatusBadge = (status: 'active' | 'paused' | 'churned') => {
    const styles = {
      active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      churned: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
    return (
      <Badge className={styles[status]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return '1 day ago'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Clients</h1>
            <p className="text-muted-foreground">Manage your podcast placement clients</p>
          </div>
          <Button onClick={() => setIsAddModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Client
          </Button>
        </div>

        {/* Month Timeline Selector */}
        <Card>
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 sm:gap-4">
                <Button variant="outline" size="icon" onClick={goToPreviousMonth} className="h-8 w-8 sm:h-10 sm:w-10">
                  <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
                <div className="text-center min-w-[160px] sm:min-w-[200px]">
                  <h3 className="text-lg sm:text-2xl font-bold">{monthNames[selectedMonth]} {selectedYear}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">Monthly Overview</p>
                </div>
                <Button variant="outline" size="icon" onClick={goToNextMonth} className="h-8 w-8 sm:h-10 sm:w-10">
                  <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={goToThisMonth} className="w-full sm:w-auto text-xs sm:text-sm">
                This Month
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{inProgressInMonth}</div>
              <p className="text-xs text-muted-foreground">Coordinating</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Booked</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{bookedInMonth}</div>
              <p className="text-xs text-muted-foreground">Confirmed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recorded</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{recordedInMonth}</div>
              <p className="text-xs text-muted-foreground">Episodes recorded</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Published</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{publishedInMonth}</div>
              <p className="text-xs text-muted-foreground">Live episodes</p>
            </CardContent>
          </Card>
        </div>

        {/* Client List */}
        <Card>
          <CardHeader>
            <CardTitle>Client List</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
                <TabsTrigger value="all">All Clients</TabsTrigger>
                <TabsTrigger value="monthly">Monthly View</TabsTrigger>
              </TabsList>

              {/* All Clients Tab */}
              <TabsContent value="all" className="space-y-4">
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="churned">Churned</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Portal</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Booked</TableHead>
                    <TableHead className="text-center">In Progress</TableHead>
                    <TableHead>Last Booking</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAllClients.map((client) => (
                    <TableRow
                      key={client.id}
                      onClick={() => navigate(`/admin/clients/${client.id}`)}
                      className="cursor-pointer hover:bg-muted/50"
                    >
                      <TableCell className="font-medium">
                        {client.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{client.email || '-'}</TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(client.status)}
                      </TableCell>
                      <TableCell className="text-center">
                        {client.portal_access_enabled ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-900">
                            <Unlock className="h-3 w-3 mr-1" />
                            Enabled
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-950 dark:text-gray-400 dark:border-gray-900">
                            <Lock className="h-3 w-3 mr-1" />
                            Disabled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-semibold">
                        {client.totalBookings}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          {client.bookedCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-yellow-500" />
                          {client.inProgressCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {client.lastBookingDate ? formatDate(client.lastBookingDate) : 'No bookings'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {filteredAllClients.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No clients found</p>
              </div>
            )}
              </TabsContent>

              {/* Monthly View Tab */}
              <TabsContent value="monthly" className="space-y-4">
                {/* Month Navigation */}
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="text-lg font-semibold min-w-[180px] text-center">
                      {monthNames[selectedMonth]} {selectedYear}
                    </div>
                    <Button variant="outline" size="icon" onClick={goToNextMonth}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button variant="outline" onClick={goToThisMonth}>
                    This Month
                  </Button>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name or email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="churned">Churned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-center">Portal</TableHead>
                        <TableHead className="text-center">Total</TableHead>
                        <TableHead className="text-center">Booked</TableHead>
                        <TableHead className="text-center">In Progress</TableHead>
                        <TableHead>Last Booking</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredClients.map((client) => (
                        <TableRow
                          key={client.id}
                          onClick={() => navigate(`/admin/clients/${client.id}`)}
                          className="cursor-pointer hover:bg-muted/50"
                        >
                          <TableCell className="font-medium">
                            {client.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{client.email || '-'}</TableCell>
                          <TableCell className="text-center">
                            {getStatusBadge(client.status)}
                          </TableCell>
                          <TableCell className="text-center">
                            {client.portal_access_enabled ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-900">
                                <Unlock className="h-3 w-3 mr-1" />
                                Enabled
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-950 dark:text-gray-400 dark:border-gray-900">
                                <Lock className="h-3 w-3 mr-1" />
                                Disabled
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center font-semibold">
                            {client.totalBookings}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="inline-flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                              {client.bookedCount}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="inline-flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-yellow-500" />
                              {client.inProgressCount}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {client.lastBookingDate ? formatDate(client.lastBookingDate) : 'No bookings'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {filteredClients.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">No clients found in {monthNames[selectedMonth]} {selectedYear}</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Add Client Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
            <DialogDescription>Create a new client profile</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Client Name *</Label>
              <Input
                id="name"
                placeholder="Enter client name"
                value={newClientForm.name}
                onChange={(e) => setNewClientForm({ ...newClientForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="client@example.com"
                value={newClientForm.email}
                onChange={(e) => setNewClientForm({ ...newClientForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact">Contact Person</Label>
              <Input
                id="contact"
                placeholder="John Doe"
                value={newClientForm.contact_person}
                onChange={(e) => setNewClientForm({ ...newClientForm, contact_person: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkedin">LinkedIn URL</Label>
              <Input
                id="linkedin"
                placeholder="https://linkedin.com/in/..."
                value={newClientForm.linkedin_url}
                onChange={(e) => setNewClientForm({ ...newClientForm, linkedin_url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                placeholder="https://example.com"
                value={newClientForm.website}
                onChange={(e) => setNewClientForm({ ...newClientForm, website: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={newClientForm.status}
                onValueChange={(value: 'active' | 'paused' | 'churned') =>
                  setNewClientForm({ ...newClientForm, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="churned">Churned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any additional notes..."
                value={newClientForm.notes}
                onChange={(e) => setNewClientForm({ ...newClientForm, notes: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateClient}
                disabled={!newClientForm.name || createClientMutation.isPending}
              >
                {createClientMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Client'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
