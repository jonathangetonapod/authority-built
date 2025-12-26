import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DollarSign, ShoppingBag, Users, TrendingUp, Package, Sparkles, Brain } from 'lucide-react'
import { getCustomerStats } from '@/services/customers'
import { getRecentOrders, getOrderStats } from '@/services/orders'
import { Link } from 'react-router-dom'

const AdminDashboard = () => {
  // Fetch customer stats
  const { data: customerStats, isLoading: customerStatsLoading } = useQuery({
    queryKey: ['customer-stats'],
    queryFn: getCustomerStats,
  })

  // Fetch order stats
  const { data: orderStats, isLoading: orderStatsLoading } = useQuery({
    queryKey: ['order-stats'],
    queryFn: getOrderStats,
  })

  // Fetch recent orders
  const { data: recentOrders, isLoading: recentOrdersLoading } = useQuery({
    queryKey: ['recent-orders'],
    queryFn: () => getRecentOrders(5),
  })

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard Overview</h1>
          <p className="text-muted-foreground mt-2">
            Welcome to your Authority Lab command center
          </p>
        </div>

        {/* Revenue Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Total Revenue */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {customerStatsLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    {formatCurrency(customerStats?.totalRevenue || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    From {customerStats?.totalOrders || 0} paid orders
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Total Customers */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {customerStatsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{customerStats?.totalCustomers || 0}</div>
                  <p className="text-xs text-muted-foreground">All time</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Average Order Value */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {customerStatsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    {formatCurrency(customerStats?.avgOrderValue || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">Per customer</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Total Orders */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {orderStatsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{orderStats?.totalOrders || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {orderStats?.paidOrders || 0} paid, {orderStats?.pendingOrders || 0} pending
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* AI Sales Director */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-purple-500/5">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
                <Brain className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-xl">AI Sales Director</CardTitle>
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                    <Sparkles className="h-3 w-3 mr-1" />
                    AI-Powered
                  </Badge>
                </div>
                <CardDescription>Your intelligent sales assistant</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Brain className="h-16 w-16 text-primary/30 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Coming Soon</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                AI-powered insights, lead prioritization, and automated follow-up recommendations will appear here.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Orders</CardTitle>
                <CardDescription>Latest customer purchases</CardDescription>
              </div>
              <Link to="/admin/customers">
                <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                  View All
                </Badge>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentOrdersLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : recentOrders && recentOrders.length > 0 ? (
              <div className="space-y-4">
                {recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">{order.customer_name}</p>
                        <Badge
                          variant={order.status === 'paid' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {order.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{order.customer_email}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <ShoppingBag className="h-3 w-3 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">
                          {order.order_items?.length || 0} item(s) • {formatDate(order.paid_at || order.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{formatCurrency(order.total_amount)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No orders yet</p>
                <p className="text-sm">Orders will appear here after customers make purchases</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Manage your content and customers</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Link
              to="/admin/premium-placements"
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div>
                <p className="font-medium">Premium Placements</p>
                <p className="text-sm text-muted-foreground">Manage podcast offerings</p>
              </div>
              <Package className="h-8 w-8 text-muted-foreground" />
            </Link>

            <Link
              to="/admin/customers"
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div>
                <p className="font-medium">Customers</p>
                <p className="text-sm text-muted-foreground">View customer orders</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </Link>

            <Link
              to="/admin/videos"
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div>
                <p className="font-medium">Testimonials</p>
                <p className="text-sm text-muted-foreground">Manage video testimonials</p>
              </div>
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}

export default AdminDashboard
