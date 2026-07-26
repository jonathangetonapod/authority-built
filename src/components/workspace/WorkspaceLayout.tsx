import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  BookOpen,
  Building2,
  Calendar,
  ClipboardList,
  Database,
  GripVertical,
  Inbox,
  LayoutDashboard,
  LogOut,
  Mailbox,
  Megaphone,
  Menu,
  Search,
  Settings,
  Share2,
  User,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { WorkspaceSwitcher } from '@/components/admin/WorkspaceSwitcher'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'

interface WorkspaceNavItem {
  id: string
  name: string
  segment: string
  icon: LucideIcon
  enabled: boolean
}

const workspaceNavItems: WorkspaceNavItem[] = [
  { id: 'onboarding', name: 'Onboarding', segment: 'onboarding', icon: ClipboardList, enabled: true },
  { id: 'podcast-finder', name: 'Podcast Finder', segment: 'podcast-finder', icon: Search, enabled: true },
  { id: 'prospects', name: 'Prospect Studio', segment: 'prospects', icon: Share2, enabled: true },
  { id: 'podcast-database', name: 'Podcast Database', segment: 'podcast-database', icon: Database, enabled: true },
  { id: 'client-podcast-system', name: 'Client Command Center', segment: 'client-podcast-system', icon: Calendar, enabled: true },
  { id: 'clients', name: 'Clients', segment: 'clients', icon: Users, enabled: true },
  { id: 'outreach-platform', name: 'Client Campaigns', segment: 'client-campaigns', icon: Megaphone, enabled: true },
  { id: 'unibox', name: 'Master Inbox', segment: 'master-inbox', icon: Inbox, enabled: true },
  { id: 'mailboxes', name: 'Mailboxes', segment: 'mailboxes', icon: Mailbox, enabled: true },
  { id: 'settings', name: 'Settings', segment: 'settings', icon: Settings, enabled: false },
]

const WORKSPACE_NAV_ORDER_STORAGE_PREFIX = 'workspace-nav-order-v2'
const WORKSPACE_NAV_SCROLL_STORAGE_PREFIX = 'workspace-nav-scroll-v1'
export const WORKSPACE_NAV_ORGANIZE_EVENT = 'goap:workspace-navigation-organize'

function orderedWorkspaceNavItems(value: unknown): WorkspaceNavItem[] {
  if (!Array.isArray(value)) return [...workspaceNavItems]

  const itemsById = new Map(workspaceNavItems.map((item) => [item.id, item]))
  const seen = new Set<string>()
  const ordered = value.flatMap((candidate) => {
    if (typeof candidate !== 'string' || seen.has(candidate)) return []
    const item = itemsById.get(candidate)
    if (!item) return []
    seen.add(candidate)
    return [item]
  })
  return [...ordered, ...workspaceNavItems.filter((item) => !seen.has(item.id))]
}

function storedWorkspaceNavItems(
  canOrganizeNavigation: boolean,
  navStorageKey: string,
  legacyNavStorageKey: string,
): WorkspaceNavItem[] {
  if (!canOrganizeNavigation || typeof window === 'undefined') return [...workspaceNavItems]

  try {
    const currentStored = window.localStorage.getItem(navStorageKey)
    const legacyStored = currentStored ? null : window.localStorage.getItem(legacyNavStorageKey)
    const stored = currentStored || legacyStored
    return orderedWorkspaceNavItems(stored ? JSON.parse(stored) : null)
  } catch {
    return [...workspaceNavItems]
  }
}

function hasSameWorkspaceNavOrder(left: WorkspaceNavItem[], right: WorkspaceNavItem[]) {
  return left.length === right.length && left.every((item, index) => item.id === right[index]?.id)
}

function readWorkspaceNavScroll(storageKey: string) {
  if (typeof window === 'undefined') return 0
  try {
    const stored = Number(window.sessionStorage.getItem(storageKey))
    return Number.isFinite(stored) && stored > 0 ? stored : 0
  } catch {
    return 0
  }
}

function saveWorkspaceNavScroll(storageKey: string, scrollTop: number) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(storageKey, String(Math.max(0, Math.round(scrollTop))))
  } catch {
    // Navigation remains usable when browser storage is unavailable.
  }
}

interface SortableWorkspaceNavItemProps {
  item: WorkspaceNavItem
  href: string
  isActive: boolean
  isEnabled: boolean
  isOrganizing: boolean
  restrictedLabel: string
  onNavigate: () => void
}

const SortableWorkspaceNavItem = ({
  item,
  href,
  isActive,
  isEnabled,
  isOrganizing,
  restrictedLabel,
  onNavigate,
}: SortableWorkspaceNavItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !isOrganizing })
  const Icon = item.icon
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li ref={setNodeRef} style={style} className={cn(isDragging && 'relative z-10 opacity-60')}>
      {isOrganizing ? (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${item.name}`}
          className={cn(
            'flex w-full touch-none cursor-grab items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-left text-sm font-medium active:cursor-grabbing',
            isActive ? 'border-primary/30 bg-primary/5 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <GripVertical className="h-4 w-4 shrink-0" />
          <Icon className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
          {!isEnabled && <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">{restrictedLabel}</Badge>}
        </button>
      ) : isEnabled ? (
        <Link
          to={href}
          onClick={onNavigate}
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            isActive
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span>{item.name}</span>
        </Link>
      ) : (
        <button
          type="button"
          disabled
          className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground/70"
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">{restrictedLabel}</Badge>
        </button>
      )}
    </li>
  )
}

export interface PlatformWorkspaceConfig {
  workspaceName: string
  logoUrl?: string | null
  baseHref: string
}

interface WorkspaceLayoutProps {
  children: React.ReactNode
  platformWorkspace?: PlatformWorkspaceConfig
}

interface WorkspaceBrandLogoProps {
  logoUrl: string | null
  workspaceName: string
  workspaceInitials: string
  placement: 'sidebar' | 'mobile' | 'settings'
}

const brandLogoSizes: Record<WorkspaceBrandLogoProps['placement'], string> = {
  sidebar: 'h-24 w-full rounded-2xl',
  mobile: 'h-12 w-20 rounded-xl',
  settings: 'h-24 w-40 rounded-xl sm:h-28 sm:w-48',
}

const brandLogoImageSpacing: Record<WorkspaceBrandLogoProps['placement'], string> = {
  sidebar: 'p-2',
  mobile: 'p-1.5',
  settings: 'p-2 sm:p-3',
}

const brandLogoFallbackSizes: Record<WorkspaceBrandLogoProps['placement'], string> = {
  sidebar: 'text-3xl',
  mobile: 'text-sm',
  settings: 'text-2xl',
}

export const WorkspaceBrandLogo = ({
  logoUrl,
  workspaceName,
  workspaceInitials,
  placement,
}: WorkspaceBrandLogoProps) => (
  <Avatar
    data-testid={`workspace-logo-${placement}`}
    data-logo-state={logoUrl ? 'uploaded' : 'initials'}
    className={cn(
      'isolate overflow-hidden shadow-none ring-0',
      logoUrl ? 'border border-transparent bg-transparent' : 'border border-border bg-muted',
      brandLogoSizes[placement],
    )}
  >
    {logoUrl && (
      <AvatarImage
        src={logoUrl}
        alt={`${workspaceName} logo`}
        className={cn(
          'aspect-auto h-full w-full object-contain',
          brandLogoImageSpacing[placement],
        )}
      />
    )}
    <AvatarFallback
      className={cn(
        'rounded-[inherit] bg-muted font-bold tracking-tight text-foreground',
        brandLogoFallbackSizes[placement],
      )}
    >
      {workspaceInitials}
    </AvatarFallback>
  </Avatar>
)

export const WorkspaceLayout = ({ children, platformWorkspace }: WorkspaceLayoutProps) => {
  const { isPlatformAdmin, membership, signOut, user, workspace } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const workspaceName = platformWorkspace?.workspaceName || workspace?.name || 'Workspace'
  const workspaceDisplayName = isPlatformAdmin && !platformWorkspace && workspace?.is_default
    ? 'My Workspace'
    : workspaceName
  const logoUrl = platformWorkspace
    ? platformWorkspace.logoUrl || null
    : workspaceLogoUrl(workspace?.id, workspace?.logo_path, workspace?.logo_updated_at)
  const workspaceInitials = workspaceName
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'W'
  const viewerEmail = user?.email
  const viewerName = membership?.full_name
    || user?.user_metadata?.full_name
    || 'Workspace user'
  const viewerRole = platformWorkspace ? 'platform owner' : membership?.role
  const baseHref = platformWorkspace?.baseHref || '/app'
  const navStorageOwner = user?.id || user?.email?.trim().toLowerCase() || 'current-user'
  const navStorageWorkspace = workspace?.id?.toLowerCase()
    || (isPlatformAdmin ? 'platform-owner' : 'unavailable-workspace')
  const canOrganizeNavigation = Boolean(user)
    && (isPlatformAdmin || (!platformWorkspace && membership?.role === 'owner'))
    && navStorageWorkspace !== 'unavailable-workspace'
  const navStorageKey = `${WORKSPACE_NAV_ORDER_STORAGE_PREFIX}:${navStorageWorkspace}:${navStorageOwner}`
  const legacyNavStorageKey = `workspace-nav-order-v1:${navStorageOwner}`
  const navScrollStorageKey = `${WORKSPACE_NAV_SCROLL_STORAGE_PREFIX}:${navStorageWorkspace}:${navStorageOwner}`
  const [navItems, setNavItems] = useState<WorkspaceNavItem[]>(() => (
    storedWorkspaceNavItems(canOrganizeNavigation, navStorageKey, legacyNavStorageKey)
  ))
  const [isOrganizing, setIsOrganizing] = useState(false)
  const navigationRef = useRef<HTMLElement>(null)
  const isDefaultNavOrder = navItems.every((item, index) => item.id === workspaceNavItems[index]?.id)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useLayoutEffect(() => {
    const navigation = navigationRef.current
    if (!navigation) return undefined

    navigation.scrollTop = readWorkspaceNavScroll(navScrollStorageKey)
    return () => saveWorkspaceNavScroll(navScrollStorageKey, navigation.scrollTop)
  }, [navScrollStorageKey])

  useEffect(() => {
    if (!canOrganizeNavigation) {
      setNavItems([...workspaceNavItems])
      setIsOrganizing(false)
      return
    }

    let savedOrder: unknown = null
    try {
      const currentStored = window.localStorage.getItem(navStorageKey)
      const legacyStored = currentStored ? null : window.localStorage.getItem(legacyNavStorageKey)
      const stored = currentStored || legacyStored
      savedOrder = stored ? JSON.parse(stored) : null
      if (!currentStored && legacyStored) {
        window.localStorage.setItem(navStorageKey, legacyStored)
      }
    } catch {
      // The default order remains available when browser storage is unavailable or invalid.
    }
    const nextItems = orderedWorkspaceNavItems(savedOrder)
    setNavItems((current) => (
      hasSameWorkspaceNavOrder(current, nextItems) ? current : nextItems
    ))
    setIsOrganizing(false)
  }, [canOrganizeNavigation, legacyNavStorageKey, navStorageKey])

  useEffect(() => {
    if (!canOrganizeNavigation) return

    const openNavigationOrganizer = () => {
      setIsOrganizing(true)
      setSidebarOpen(true)
    }
    window.addEventListener(WORKSPACE_NAV_ORGANIZE_EVENT, openNavigationOrganizer)
    return () => window.removeEventListener(WORKSPACE_NAV_ORGANIZE_EVENT, openNavigationOrganizer)
  }, [canOrganizeNavigation])

  const saveNavOrder = (items: WorkspaceNavItem[]) => {
    if (!canOrganizeNavigation) return
    try {
      window.localStorage.setItem(navStorageKey, JSON.stringify(items.map((item) => item.id)))
    } catch {
      // The reordered navigation remains usable in this tab when storage is unavailable.
    }
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!canOrganizeNavigation || !over || active.id === over.id) return
    setNavItems((current) => {
      const oldIndex = current.findIndex((item) => item.id === active.id)
      const newIndex = current.findIndex((item) => item.id === over.id)
      if (oldIndex < 0 || newIndex < 0) return current
      const reordered = arrayMove(current, oldIndex, newIndex)
      saveNavOrder(reordered)
      return reordered
    })
  }

  const handleResetNavOrder = () => {
    if (!canOrganizeNavigation) return
    setNavItems([...workspaceNavItems])
    try {
      window.localStorage.removeItem(navStorageKey)
    } catch {
      // The default order still applies in this tab when storage is unavailable.
    }
    toast.success('Sidebar order reset.')
  }

  const handleSidebarNavigate = () => {
    if (navigationRef.current) {
      saveWorkspaceNavScroll(navScrollStorageKey, navigationRef.current.scrollTop)
    }
    setSidebarOpen(false)
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to sign out.')
    }
  }

  return (
    <div data-testid="workspace-layout" className="min-h-screen max-w-full overflow-x-clip bg-background">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close workspace navigation"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform border-r border-border bg-card transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between border-b border-border px-6">
            <h1 className="truncate text-xl font-bold">{workspaceName}</h1>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close workspace navigation"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="border-b border-border px-4 py-4">
            <WorkspaceBrandLogo
              logoUrl={logoUrl}
              workspaceName={workspaceName}
              workspaceInitials={workspaceInitials}
              placement="sidebar"
            />
            <div className="mt-3 min-w-0 px-1">
              <p className="truncate text-base font-bold tracking-tight">{workspaceDisplayName}</p>
              <p className="truncate text-xs font-medium text-muted-foreground">
                {workspaceDisplayName === workspaceName ? 'Workspace dashboard' : workspaceName}
              </p>
            </div>
          </div>

          <nav
            ref={navigationRef}
            aria-label="Workspace navigation"
            className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 [scrollbar-gutter:stable]"
            onScroll={(event) => saveWorkspaceNavScroll(navScrollStorageKey, event.currentTarget.scrollTop)}
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Navigation</p>
              {canOrganizeNavigation && isOrganizing && (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={isDefaultNavOrder}
                    onClick={handleResetNavOrder}
                  >
                    Reset
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setIsOrganizing(false)}
                  >
                    Done
                  </Button>
                </div>
              )}
            </div>
            {canOrganizeNavigation && !isOrganizing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mb-3 w-full justify-start border-dashed text-muted-foreground hover:text-foreground"
                onClick={() => setIsOrganizing(true)}
              >
                <GripVertical className="mr-2 h-4 w-4" />
                Reorder sidebar pages
              </Button>
            )}
            {isOrganizing && (
              <p className="mb-2 px-1 text-xs text-muted-foreground">Drag pages into your preferred order. Changes save automatically.</p>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={navItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-1">
                  {navItems.map((item) => {
                    const href = `${baseHref}/${item.segment}`
                    const isActive = location.pathname === href || location.pathname.startsWith(`${href}/`)
                    const isSettings = item.id === 'settings'
                    const itemEnabled = isSettings
                      ? Boolean(isPlatformAdmin || platformWorkspace || membership?.role === 'owner' || membership?.role === 'admin')
                      : item.enabled

                    return (
                      <SortableWorkspaceNavItem
                        key={item.id}
                        item={item}
                        href={href}
                        isActive={isActive}
                        isEnabled={itemEnabled}
                        isOrganizing={isOrganizing}
                        restrictedLabel={isSettings ? 'Owner/Admin' : 'Soon'}
                        onNavigate={handleSidebarNavigate}
                      />
                    )
                  })}
                </ul>
              </SortableContext>
            </DndContext>
          </nav>

          <div className="border-t border-border p-4">
            <div className="mb-3 flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback><User className="h-5 w-5" /></AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{viewerName}</p>
                <p className="truncate text-xs text-muted-foreground">{viewerEmail}</p>
              </div>
              {viewerRole && <Badge variant="outline" className="capitalize">{viewerRole}</Badge>}
            </div>
            <Button
              onClick={() => void handleSignOut()}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <LogOut className="mr-2 h-4 w-4" />Sign out
            </Button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-30 flex h-20 items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open workspace navigation"
            className="lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-sm font-semibold">{workspaceDisplayName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {workspaceDisplayName === workspaceName ? 'Workspace dashboard' : workspaceName}
            </p>
          </div>
          <div className="min-w-0 flex-1 lg:hidden">
            <p className="truncate text-sm font-semibold">{workspaceDisplayName}</p>
            <p className="truncate text-xs text-muted-foreground">Workspace dashboard</p>
          </div>
          <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
            {isPlatformAdmin && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/app/manage-workspaces" aria-label="Manage workspaces">
                  <Building2 className="h-4 w-4 xl:mr-2" /><span className="hidden xl:inline">Manage workspaces</span>
                </Link>
              </Button>
            )}
            {isPlatformAdmin && (
              <div className="w-44 min-w-0 sm:w-60 lg:w-72">
                <WorkspaceSwitcher />
              </div>
            )}
          </div>
        </header>

        <main className="min-w-0 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
