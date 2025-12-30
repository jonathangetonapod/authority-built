import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import {
  Package,
  Search,
  Filter,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  TrendingUp,
  DollarSign,
  Users
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  getAllBookingAddons,
  updateBookingAddonStatus,
  formatPrice,
  getAddonStatusColor,
  getAddonStatusText,
  type BookingAddon
} from '@/services/addonServices'

export default function OrdersManagement() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [serviceFilter, setServiceFilter] = useState<string>('all')
  const [selectedOrder, setSelectedOrder] = useState<BookingAddon | null>(null)

  // Fetch all orders
  const { data: orders, isLoading } = useQuery({
    queryKey: ['all-booking-addons'],
    queryFn: getAllBookingAddons,
    staleTime: 0,
  })

  // Update order mutation
  const updateOrderMutation = useMutation({
    mutationFn: ({
      addonId,
      status,
      googleDriveUrl,
      adminNotes
    }: {
      addonId: string
      status: BookingAddon['status']
      googleDriveUrl?: string
      adminNotes?: string
    }) => updateBookingAddonStatus(addonId, status, googleDriveUrl, adminNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-booking-addons'] })
      toast({
        title: 'Order Updated',
        description: 'Order status has been updated successfully',
      })
      setSelectedOrder(null)
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update order',
        variant: 'destructive',
      })
    }
  })

  // Filter and search orders
  const filteredOrders = useMemo(() => {
    if (!orders) return []

    return orders.filter(order => {
      // Status filter
      if (statusFilter !== 'all' && order.status !== statusFilter) return false

      // Service filter
      if (serviceFilter !== 'all' && order.service?.name !== serviceFilter) return false

      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase()
        return (
          order.client?.name.toLowerCase().includes(searchLower) ||
          order.booking?.podcast_name.toLowerCase().includes(searchLower) ||
          order.service?.name.toLowerCase().includes(searchLower) ||
          order.client?.email?.toLowerCase().includes(searchLower)
        )
      }

      return true
    })
  }, [orders, statusFilter, serviceFilter, searchTerm])

  // Calculate stats
  const stats = useMemo(() => {
    if (!orders) return { total: 0, pending: 0, inProgress: 0, delivered: 0, revenue: 0 }

    return {
      total: orders.length,
      pending: orders.filter(o => o.status === 'pending').length,
      inProgress: orders.filter(o => o.status === 'in_progress').length,
      delivered: orders.filter(o => o.status === 'delivered').length,
      revenue: orders.reduce((sum, o) => sum + o.amount_paid_cents, 0)
    }
  }, [orders])

  // Get unique service names for filter
  const serviceNames = useMemo(() => {
    if (!orders) return []
    return Array.from(new Set(orders.map(o => o.service?.name).filter(Boolean))) as string[]
  }, [orders])

  const handleQuickStatusUpdate = (orderId: string, newStatus: BookingAddon['status']) => {
    const order = orders?.find(o => o.id === orderId)
    if (!order) return

    updateOrderMutation.mutate({
      addonId: orderId,
      status: newStatus,
      googleDriveUrl: order.google_drive_url || undefined,
      adminNotes: order.admin_notes || undefined
    })
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-8 w-8" />
            Add-on Service Orders
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage and track all addon service orders across all clients
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <AlertCircle className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Loader2 className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.inProgress}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Delivered</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.delivered}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPrice(stats.revenue)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {/* Search */}
              <div className="space-y-2">
                <Label htmlFor="search">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Client, podcast, or service..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Status Filter */}
              <div className="space-y-2">
                <Label htmlFor="status-filter">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger id="status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Service Filter */}
              <div className="space-y-2">
                <Label htmlFor="service-filter">Service</Label>
                <Select value={serviceFilter} onValueChange={setServiceFilter}>
                  <SelectTrigger id="service-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Services</SelectItem>
                    {serviceNames.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Orders Table */}
        <Card>
          <CardHeader>
            <CardTitle>Orders ({filteredOrders.length})</CardTitle>
            <CardDescription>
              {filteredOrders.length === orders?.length
                ? 'Showing all orders'
                : `Showing ${filteredOrders.length} of ${orders?.length} orders`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-12">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Orders Found</h3>
                <p className="text-muted-foreground">
                  {orders?.length === 0
                    ? 'No addon orders have been placed yet.'
                    : 'No orders match your current filters.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>Podcast</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Purchased</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <div>
                            <Link
                              to={`/admin/clients/${order.client_id}`}
                              className="font-medium hover:underline"
                            >
                              {order.client?.name || 'Unknown'}
                            </Link>
                            {order.client?.email && (
                              <div className="text-xs text-muted-foreground">{order.client.email}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{order.service?.name}</div>
                            {order.service?.delivery_days && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {order.service.delivery_days}d delivery
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {order.booking?.podcast_image_url && (
                              <img
                                src={order.booking.podcast_image_url}
                                alt={order.booking.podcast_name}
                                className="w-8 h-8 rounded object-cover"
                              />
                            )}
                            <div className="max-w-[200px]">
                              <div className="font-medium truncate">{order.booking?.podcast_name || 'Unknown'}</div>
                              {order.booking?.host_name && (
                                <div className="text-xs text-muted-foreground truncate">{order.booking.host_name}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold">{formatPrice(order.amount_paid_cents)}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {new Date(order.purchased_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </div>
                          {order.delivered_at && (
                            <div className="text-xs text-muted-foreground">
                              Delivered: {new Date(order.delivered_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric'
                              })}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={order.status}
                            onValueChange={(value) => handleQuickStatusUpdate(order.id, value as BookingAddon['status'])}
                          >
                            <SelectTrigger className="w-[140px]">
                              <Badge className={getAddonStatusColor(order.status)}>
                                {getAddonStatusText(order.status)}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="delivered">Delivered</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedOrder(order)}
                          >
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle>Order Details</DialogTitle>
                <DialogDescription>
                  Order ID: {selectedOrder.id}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Client & Service Info */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-2">Client</h4>
                    <div className="text-sm space-y-1">
                      <div>{selectedOrder.client?.name}</div>
                      {selectedOrder.client?.email && (
                        <div className="text-muted-foreground">{selectedOrder.client.email}</div>
                      )}
                      <Link
                        to={`/admin/clients/${selectedOrder.client_id}`}
                        className="text-primary hover:underline inline-flex items-center gap-1 mt-2"
                      >
                        View Client Profile
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Service</h4>
                    <div className="text-sm space-y-1">
                      <div className="font-medium">{selectedOrder.service?.name}</div>
                      <div className="text-muted-foreground">{selectedOrder.service?.short_description}</div>
                      <div className="text-lg font-bold mt-2">{formatPrice(selectedOrder.amount_paid_cents)}</div>
                    </div>
                  </div>
                </div>

                {/* Podcast Info */}
                {selectedOrder.booking && (
                  <div>
                    <h4 className="font-semibold mb-2">Podcast Episode</h4>
                    <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
                      {selectedOrder.booking.podcast_image_url && (
                        <img
                          src={selectedOrder.booking.podcast_image_url}
                          alt={selectedOrder.booking.podcast_name}
                          className="w-16 h-16 rounded-md object-cover"
                        />
                      )}
                      <div>
                        <div className="font-medium">{selectedOrder.booking.podcast_name}</div>
                        {selectedOrder.booking.host_name && (
                          <div className="text-sm text-muted-foreground">Host: {selectedOrder.booking.host_name}</div>
                        )}
                        {selectedOrder.booking.publish_date && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Published: {new Date(selectedOrder.booking.publish_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Status & Dates */}
                <div>
                  <h4 className="font-semibold mb-2">Order Status</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge className={getAddonStatusColor(selectedOrder.status)}>
                        {getAddonStatusText(selectedOrder.status)}
                      </Badge>
                    </div>
                    <div className="text-sm space-y-1">
                      <div>Purchased: {new Date(selectedOrder.purchased_at).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: 'numeric'
                      })}</div>
                      {selectedOrder.delivered_at && (
                        <div>Delivered: {new Date(selectedOrder.delivered_at).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        })}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Google Drive URL */}
                {selectedOrder.google_drive_url && (
                  <div>
                    <h4 className="font-semibold mb-2">Delivery Link</h4>
                    <a
                      href={selectedOrder.google_drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      View in Google Drive
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                )}

                {/* Admin Notes */}
                {selectedOrder.admin_notes && (
                  <div>
                    <h4 className="font-semibold mb-2">Admin Notes</h4>
                    <div className="text-sm p-3 rounded-lg bg-muted/50">
                      {selectedOrder.admin_notes}
                    </div>
                  </div>
                )}

                {/* Payment Info */}
                {selectedOrder.stripe_payment_intent_id && (
                  <div>
                    <h4 className="font-semibold mb-2">Payment Details</h4>
                    <div className="text-sm text-muted-foreground">
                      Payment Intent: {selectedOrder.stripe_payment_intent_id}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedOrder(null)}
                  className="flex-1"
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    window.location.href = `/admin/clients/${selectedOrder.client_id}`
                  }}
                  className="flex-1"
                >
                  Manage in Client Profile
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
