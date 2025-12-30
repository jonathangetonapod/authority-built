import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  LayoutDashboard,
  FileText,
  Video,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  User,
  GripVertical,
  Sparkles,
  ShoppingBag,
  BarChart3,
  Brain,
  Calendar,
  Search,
  BookOpen,
  Package
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface DashboardLayoutProps {
  children: React.ReactNode
}

interface NavItem {
  id: string
  name: string
  href: string
  icon: React.ElementType
}

const defaultNavItems: NavItem[] = [
  { id: 'overview', name: 'Overview', href: '/admin/dashboard', icon: LayoutDashboard },
  { id: 'podcast-finder', name: 'Podcast Finder', href: '/admin/podcast-finder', icon: Search },
  { id: 'ai-sales-director', name: 'AI Sales Director', href: '/admin/ai-sales-director', icon: Brain },
  { id: 'calendar', name: 'Client Podcast System', href: '/admin/calendar', icon: Calendar },
  { id: 'clients', name: 'Clients', href: '/admin/clients', icon: Users },
  { id: 'orders', name: 'Add-on Service Orders', href: '/admin/orders', icon: Package },
  { id: 'blog', name: 'Blog Posts', href: '/admin/blog', icon: FileText },
  { id: 'guest-resources', name: 'Guest Resources', href: '/admin/guest-resources', icon: BookOpen },
  { id: 'videos', name: 'Video Testimonials', href: '/admin/videos', icon: Video },
  { id: 'premium', name: 'Premium Placements', href: '/admin/premium-placements', icon: Sparkles },
  { id: 'customers', name: 'Premium Placement Orders', href: '/admin/customers', icon: ShoppingBag },
  { id: 'analytics', name: 'Premium Placement Analytics', href: '/admin/analytics', icon: BarChart3 },
  { id: 'leads', name: 'Unibox', href: '/admin/leads', icon: Users },
  { id: 'settings', name: 'Settings', href: '/admin/settings', icon: Settings },
]

const STORAGE_KEY = 'admin-nav-order'

// Sortable Nav Item Component
interface SortableNavItemProps {
  item: NavItem
  isActive: boolean
  onNavigate: () => void
}

const SortableNavItem = ({ item, isActive, onNavigate }: SortableNavItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const Icon = item.icon

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 rounded-lg transition-colors',
        isDragging && 'opacity-50'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      <Link
        to={item.href}
        onClick={onNavigate}
        className={cn(
          'flex-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <Icon className="h-5 w-5" />
        {item.name}
      </Link>
    </div>
  )
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [navItems, setNavItems] = useState<NavItem[]>(defaultNavItems)

  // Load nav order from localStorage
  useEffect(() => {
    const savedOrder = localStorage.getItem(STORAGE_KEY)
    if (savedOrder) {
      try {
        const orderIds = JSON.parse(savedOrder) as string[]
        const orderedItems = orderIds
          .map(id => defaultNavItems.find(item => item.id === id))
          .filter((item): item is NavItem => item !== undefined)

        // Add any new items that weren't in saved order
        const newItems = defaultNavItems.filter(
          item => !orderIds.includes(item.id)
        )

        setNavItems([...orderedItems, ...newItems])
      } catch (error) {
        console.error('Failed to load nav order:', error)
      }
    }
  }, [])

  // Save nav order to localStorage
  const saveNavOrder = (items: NavItem[]) => {
    const orderIds = items.map(item => item.id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orderIds))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      setNavItems((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id)
        const newIndex = items.findIndex(item => item.id === over.id)
        const newItems = arrayMove(items, oldIndex, newIndex)
        saveNavOrder(newItems)
        return newItems
      })
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success('Signed out successfully')
      navigate('/admin/login')
    } catch (error) {
      console.error('Error signing out:', error)
      toast.error('Failed to sign out. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform bg-card border-r border-border transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo/Brand */}
          <div className="flex h-16 items-center justify-between border-b border-border px-6">
            <h1 className="text-xl font-bold">Get On A Pod</h1>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={navItems.map(item => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {navItems.map((item) => (
                  <SortableNavItem
                    key={item.id}
                    item={item}
                    isActive={location.pathname === item.href}
                    onNavigate={() => setSidebarOpen(false)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </nav>

          {/* User section */}
          <div className="border-t border-border p-4">
            <div className="flex items-center gap-3 mb-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={user?.user_metadata?.avatar_url} />
                <AvatarFallback>
                  <User className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user?.user_metadata?.full_name || 'User'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email}
                </p>
              </div>
            </div>
            <Button
              onClick={handleSignOut}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-card px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Admin Dashboard</h1>
        </header>

        {/* Page content */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
