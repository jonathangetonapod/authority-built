import { useClientPortal } from '@/contexts/ClientPortalContext'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LogOut, User, LayoutDashboard, BookOpen, Eye, X } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { safeExternalUrl } from '@/lib/externalUrl'

interface PortalLayoutProps {
  children: React.ReactNode
}

export function PortalLayout({ children }: PortalLayoutProps) {
  const { client, branding, logout, isImpersonating, exitImpersonation } = useClientPortal()
  const navigate = useNavigate()
  const location = useLocation()
  const agencyName = branding?.name || 'Client Portal'
  const agencyLogoUrl = branding?.logo_url ? safeExternalUrl(branding.logo_url) : null

  const handleLogout = async () => {
    await logout()
    navigate('/portal/login')
  }

  const handleExitImpersonation = () => {
    exitImpersonation()
    navigate('/admin/clients')
  }

  const navItems = [
    {
      path: '/portal/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      path: '/portal/resources',
      label: 'Resources',
      icon: BookOpen,
    },
  ]

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          {/* Logo/Brand */}
          <div className="flex items-center gap-2">
            {agencyLogoUrl ? (
              <img
                src={agencyLogoUrl}
                alt={`${agencyName} logo`}
                className="h-8 w-8 rounded-lg object-contain"
              />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">
                  {agencyName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold">{agencyName}</h1>
              <p className="text-xs text-muted-foreground">Client Portal</p>
            </div>
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    {client?.photo_url && <AvatarImage src={client.photo_url} alt={client.name} />}
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {client ? getInitials(client.name) : <User className="h-4 w-4" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium">{client?.name}</p>
                    <p className="text-xs text-muted-foreground">{client?.email}</p>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{client?.name}</p>
                    <p className="text-xs text-muted-foreground">{client?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Impersonation Banner */}
      {isImpersonating && (
        <Alert className="rounded-none border-x-0 border-t-0 bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700">
          <AlertDescription className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
                Admin View: You are viewing the portal as {client?.name}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExitImpersonation}
              className="bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              <X className="h-4 w-4 mr-2" />
              Exit Admin View
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Navigation Tabs */}
      <div className="border-b bg-background">
        <div className="container mx-auto px-4">
          <nav className="flex gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 md:py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto">
        <div className="container mx-auto px-4 py-6">
          <p className="text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} {agencyName}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
