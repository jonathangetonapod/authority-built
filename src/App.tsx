import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ClientPortalProvider } from "@/contexts/ClientPortalContext";
import { PlatformAdminRoute, ProtectedRoute } from "@/components/ProtectedRoute";
import { queryClient } from "@/lib/queryClient";
import { ClientProtectedRoute } from "@/components/ClientProtectedRoute";
import Index from "./pages/Index";
import Resources from "./pages/Resources";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Course from "./pages/Course";
import WhatToExpect from "./pages/WhatToExpect";
import NotFound from "./pages/NotFound";
import AdminLogin from "./pages/admin/Login";
import PodcastDatabase from "./pages/admin/PodcastDatabase";
import AuthCallback from "./pages/admin/Callback";
import CalendarDashboard from "./pages/admin/CalendarDashboard";
import UpcomingRecordings from "./pages/admin/UpcomingRecordings";
import UpcomingGoingLive from "./pages/admin/UpcomingGoingLive";
import ClientsManagement from "./pages/admin/ClientsManagement";
import ClientDetail from "./pages/admin/ClientDetail";
import GuestResourcesManagement from "./pages/admin/GuestResourcesManagement";
import PortalLogin from "./pages/portal/Login";
import PortalDashboard from "./pages/portal/DashboardMvp";
import PortalResources from "./pages/portal/Resources";
import ProspectView from "./pages/prospect/ProspectView";
import ClientApprovalView from "./pages/client/ClientApprovalView";
import AcceptInvite from "./pages/admin/AcceptInvite";
import WorkspaceClients from "./pages/app/WorkspaceClients";
import WorkspaceClientDetail from "./pages/app/WorkspaceClientDetail";
import WorkspaceGuestResources from "./pages/app/WorkspaceGuestResources";
import WorkspaceOnboarding from "./pages/app/WorkspaceOnboarding";
import MyWorkspaceSettings from "./pages/app/MyWorkspaceSettings";
import WorkspaceBilling from "./pages/app/WorkspaceBilling";
import WorkspaceOverview from "./pages/app/WorkspaceOverview";
import WorkspaceCampaignDetail from "./pages/app/WorkspaceCampaignDetail";
import WorkspaceOutreachSuite from "./pages/app/WorkspaceOutreachSuite";
import WorkspacePodcastFinderHome from "./pages/app/WorkspacePodcastFinderHome";
import WorkspacePodcastFinder from "./pages/app/WorkspacePodcastFinder";
import WorkspacePodcastDatabase from "./pages/app/WorkspacePodcastDatabase";
import WorkspaceClientPodcastSystem from "./pages/app/WorkspaceClientPodcastSystem";
import WorkspaceProspectDashboards from "./pages/app/WorkspaceProspectDashboards";
import AdminWorkspaceOverview from "./pages/admin/AdminWorkspaceOverview";
import AdminWorkspaceCampaignDetail from "./pages/admin/AdminWorkspaceCampaignDetail";
import AdminWorkspaceOutreachSuite from "./pages/admin/AdminWorkspaceOutreachSuite";
import AdminWorkspaceClients from "./pages/admin/AdminWorkspaceClients";
import AdminWorkspaceClientDetail from "./pages/admin/AdminWorkspaceClientDetail";
import AdminWorkspaceGuestResources from "./pages/admin/AdminWorkspaceGuestResources";
import AdminWorkspaceOnboarding from "./pages/admin/AdminWorkspaceOnboarding";
import AdminWorkspaceStaff from "./pages/admin/AdminWorkspaceStaff";
import AdminWorkspacePodcastFinderHome from "./pages/admin/AdminWorkspacePodcastFinderHome";
import AdminWorkspacePodcastFinder from "./pages/admin/AdminWorkspacePodcastFinder";
import AdminWorkspacePodcastDatabase from "./pages/admin/AdminWorkspacePodcastDatabase";
import AdminWorkspaceClientPodcastSystem from "./pages/admin/AdminWorkspaceClientPodcastSystem";
import AdminWorkspaceProspectDashboards from "./pages/admin/AdminWorkspaceProspectDashboards";
import ChangeInitialPassword from "./pages/account/ChangeInitialPassword";
import ClientOnboarding from "./pages/onboarding/ClientOnboarding";
import { selectedWorkspaceBaseHref, workspaceModuleHref, type WorkspaceModule } from "@/lib/workspaceRoutes";

const KeyedProspectView = () => {
  const { slug } = useParams()
  return <ProspectView key={slug || 'missing'} />
}

const KeyedClientApprovalView = () => {
  const { slug } = useParams()
  return <ClientApprovalView key={slug || 'missing'} />
}

const LegacyAdminWorkspaceRedirect = ({ module }: { module: WorkspaceModule }) => {
  const { workspaceId = '' } = useParams()
  return <Navigate to={workspaceModuleHref(selectedWorkspaceBaseHref(workspaceId), module)} replace />
}

const SelectedWorkspaceRootRedirect = () => {
  const { workspaceId = '' } = useParams()
  return <Navigate to={workspaceModuleHref(selectedWorkspaceBaseHref(workspaceId), 'overview')} replace />
}

const LegacyAdminWorkspacePodcastFinderRedirect = () => {
  const { workspaceId = '', clientId = '' } = useParams()
  return <Navigate to={`${selectedWorkspaceBaseHref(workspaceId)}/podcast-finder?client=${encodeURIComponent(clientId)}`} replace />
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ClientPortalProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/docs" element={<Navigate to="/" replace />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/premium-placements" element={<Navigate to="/" replace />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/course" element={<Course />} />
            <Route path="/what-to-expect" element={<WhatToExpect />} />
            <Route path="/onboarding" element={<Navigate to="/" replace />} />
            <Route path="/onboarding/:token" element={<ClientOnboarding />} />

            {/* Invite-only workspace account routes */}
            <Route path="/login" element={<AdminLogin />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/change-password" element={<ChangeInitialPassword />} />
            <Route path="/app" element={<Navigate to="/app/overview" replace />} />
            <Route path="/app/workspace-users" element={<Navigate to="/app/settings" replace />} />
            <Route path="/app/manage-workspaces" element={<Navigate to="/app/settings" replace />} />
            <Route
              path="/app/overview"
              element={
                <ProtectedRoute>
                  <WorkspaceOverview />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/settings"
              element={
                <ProtectedRoute>
                  <MyWorkspaceSettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/settings/billing"
              element={
                <ProtectedRoute>
                  <WorkspaceBilling />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/onboarding"
              element={
                <ProtectedRoute>
                  <WorkspaceOnboarding />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/clients"
              element={
                <ProtectedRoute>
                  <WorkspaceClients />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/clients/:clientId"
              element={
                <ProtectedRoute>
                  <WorkspaceClientDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/podcast-finder"
              element={
                <ProtectedRoute>
                  <WorkspacePodcastFinderHome />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/podcast-database"
              element={
                <ProtectedRoute>
                  <WorkspacePodcastDatabase />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/client-podcast-system"
              element={
                <ProtectedRoute>
                  <WorkspaceClientPodcastSystem />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/prospects"
              element={
                <ProtectedRoute>
                  <WorkspaceProspectDashboards />
                </ProtectedRoute>
              }
            />
            <Route path="/app/prospect-dashboards" element={<Navigate to="/app/prospects" replace />} />
            <Route
              path="/app/clients/:clientId/podcast-finder"
              element={
                <ProtectedRoute>
                  <WorkspacePodcastFinder />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/guest-resources"
              element={
                <ProtectedRoute>
                  <WorkspaceGuestResources />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/client-campaigns"
              element={
                <ProtectedRoute>
                  <WorkspaceOutreachSuite module="client-campaigns" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/client-campaigns/:clientId"
              element={
                <ProtectedRoute>
                  <WorkspaceCampaignDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/master-inbox"
              element={
                <ProtectedRoute>
                  <WorkspaceOutreachSuite module="master-inbox" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/mailboxes"
              element={
                <ProtectedRoute>
                  <WorkspaceOutreachSuite module="mailboxes" />
                </ProtectedRoute>
              }
            />
            <Route path="/app/outreach-platform" element={<Navigate to="/app/client-campaigns" replace />} />
            <Route path="/app/unibox" element={<Navigate to="/app/master-inbox" replace />} />

            {/* The platform owner uses the same workspace shell and tools for selected workspaces. */}
            <Route
              path="/app/workspaces/:workspaceId"
              element={
                <PlatformAdminRoute>
                  <SelectedWorkspaceRootRedirect />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/app/workspaces/:workspaceId/overview"
              element={
                <PlatformAdminRoute>
                  <AdminWorkspaceOverview />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/app/workspaces/:workspaceId/onboarding"
              element={
                <PlatformAdminRoute>
                  <AdminWorkspaceOnboarding />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/app/workspaces/:workspaceId/podcast-finder"
              element={
                <PlatformAdminRoute>
                  <AdminWorkspacePodcastFinderHome />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/app/workspaces/:workspaceId/podcast-database"
              element={
                <PlatformAdminRoute>
                  <AdminWorkspacePodcastDatabase />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/app/workspaces/:workspaceId/prospects"
              element={
                <PlatformAdminRoute>
                  <AdminWorkspaceProspectDashboards />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/app/workspaces/:workspaceId/prospect-dashboards"
              element={<LegacyAdminWorkspaceRedirect module="prospects" />}
            />
            <Route
              path="/app/workspaces/:workspaceId/clients"
              element={
                <PlatformAdminRoute>
                  <AdminWorkspaceClients />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/app/workspaces/:workspaceId/clients/:clientId"
              element={
                <PlatformAdminRoute>
                  <AdminWorkspaceClientDetail />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/app/workspaces/:workspaceId/clients/:clientId/podcast-finder"
              element={
                <PlatformAdminRoute>
                  <AdminWorkspacePodcastFinder />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/app/workspaces/:workspaceId/settings"
              element={
                <PlatformAdminRoute>
                  <AdminWorkspaceStaff />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/app/workspaces/:workspaceId/guest-resources"
              element={
                <PlatformAdminRoute>
                  <AdminWorkspaceGuestResources />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/app/workspaces/:workspaceId/client-campaigns"
              element={
                <PlatformAdminRoute>
                  <AdminWorkspaceOutreachSuite module="client-campaigns" />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/app/workspaces/:workspaceId/client-podcast-system"
              element={
                <PlatformAdminRoute>
                  <AdminWorkspaceClientPodcastSystem />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/app/workspaces/:workspaceId/client-campaigns/:clientId"
              element={
                <PlatformAdminRoute>
                  <AdminWorkspaceCampaignDetail />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/app/workspaces/:workspaceId/master-inbox"
              element={
                <PlatformAdminRoute>
                  <AdminWorkspaceOutreachSuite module="master-inbox" />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/app/workspaces/:workspaceId/mailboxes"
              element={
                <PlatformAdminRoute>
                  <AdminWorkspaceOutreachSuite module="mailboxes" />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/app/workspaces/:workspaceId/outreach-platform"
              element={<LegacyAdminWorkspaceRedirect module="client-campaigns" />}
            />
            <Route
              path="/app/workspaces/:workspaceId/unibox"
              element={<LegacyAdminWorkspaceRedirect module="master-inbox" />}
            />

            {/* Billing is intentionally out of scope for the invite-only MVP. */}
            <Route path="/checkout" element={<Navigate to="/" replace />} />
            <Route path="/checkout/success" element={<Navigate to="/" replace />} />
            <Route path="/checkout/canceled" element={<Navigate to="/" replace />} />

            <Route path="/test-analytics" element={<Navigate to="/" replace />} />

            {/* Client Portal routes */}
            <Route path="/portal" element={<Navigate to="/portal/login" replace />} />
            <Route path="/portal/login" element={<PortalLogin />} />
            {/* Public prospect dashboard */}
            <Route path="/prospect/:slug" element={<KeyedProspectView />} />
            {/* Public client approval dashboard */}
            <Route path="/client/:slug" element={<KeyedClientApprovalView />} />
            <Route
              path="/portal/dashboard"
              element={
                <ClientProtectedRoute>
                  <PortalDashboard />
                </ClientProtectedRoute>
              }
            />
            <Route
              path="/portal/resources"
              element={
                <ClientProtectedRoute>
                  <PortalResources />
                </ClientProtectedRoute>
              }
            />

            {/* Admin routes */}
            <Route path="/admin" element={<Navigate to="/app/overview" replace />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/callback" element={<AuthCallback />} />

            {/* Retired admin surfaces redirect to the supported admin landing page. */}
            <Route path="/admin/ai-sales-director/*" element={<Navigate to="/app/overview" replace />} />
            <Route path="/admin/videos/*" element={<Navigate to="/app/overview" replace />} />
            <Route path="/admin/blog/*" element={<Navigate to="/app/overview" replace />} />
            <Route path="/admin/premium-placements/*" element={<Navigate to="/app/overview" replace />} />
            <Route path="/admin/customers/*" element={<Navigate to="/app/overview" replace />} />
            <Route path="/admin/orders/*" element={<Navigate to="/app/overview" replace />} />
            <Route path="/admin/analytics/*" element={<Navigate to="/app/overview" replace />} />
            <Route path="/admin/settings/*" element={<Navigate to="/app/settings" replace />} />

            <Route
              path="/admin/users"
              element={<Navigate to="/app/settings" replace />}
            />
            <Route
              path="/admin/dashboard"
              element={<Navigate to="/app/overview" replace />}
            />
            <Route path="/admin/onboarding" element={<Navigate to="/app/onboarding" replace />} />
            <Route
              path="/admin/podcast-finder"
              element={<Navigate to="/app/podcast-finder" replace />}
            />
            <Route
              path="/admin/prospect-dashboards"
              element={<Navigate to="/app/prospects" replace />}
            />
            <Route path="/admin/prospects" element={<Navigate to="/app/prospects" replace />} />
            <Route
              path="/admin/podcast-database"
              element={
                <PlatformAdminRoute>
                  <PodcastDatabase />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/calendar"
              element={
                <PlatformAdminRoute>
                  <CalendarDashboard />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/upcoming"
              element={
                <PlatformAdminRoute>
                  <UpcomingRecordings />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/going-live"
              element={
                <PlatformAdminRoute>
                  <UpcomingGoingLive />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/clients"
              element={
                <PlatformAdminRoute>
                  <ClientsManagement />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/clients/:id"
              element={
                <PlatformAdminRoute>
                  <ClientDetail />
                </PlatformAdminRoute>
              }
            />
            <Route
              path="/admin/workspaces/:workspaceId/onboarding"
              element={<LegacyAdminWorkspaceRedirect module="onboarding" />}
            />
            <Route
              path="/admin/workspaces/:workspaceId/prospect-dashboards"
              element={<LegacyAdminWorkspaceRedirect module="prospects" />}
            />
            <Route
              path="/admin/workspaces/:workspaceId/clients"
              element={<LegacyAdminWorkspaceRedirect module="clients" />}
            />
            <Route
              path="/admin/workspaces/:workspaceId/clients/:clientId/podcast-finder"
              element={<LegacyAdminWorkspacePodcastFinderRedirect />}
            />
            <Route
              path="/admin/workspaces/:workspaceId/workspace-users"
              element={<LegacyAdminWorkspaceRedirect module="settings" />}
            />
            <Route
              path="/admin/workspaces/:workspaceId/settings"
              element={<LegacyAdminWorkspaceRedirect module="settings" />}
            />
            <Route
              path="/admin/workspaces/:workspaceId/guest-resources"
              element={<LegacyAdminWorkspaceRedirect module="guest-resources" />}
            />
            <Route path="/admin/outreach-platform" element={<Navigate to="/app/client-campaigns" replace />} />
            <Route path="/admin/leads" element={<Navigate to="/app/master-inbox" replace />} />
            <Route path="/admin/mailboxes" element={<Navigate to="/app/mailboxes" replace />} />
            <Route
              path="/admin/guest-resources"
              element={
                <PlatformAdminRoute>
                  <GuestResourcesManagement />
                </PlatformAdminRoute>
              }
            />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ClientPortalProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
