import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Resources from "./pages/Resources";
import PremiumPlacements from "./pages/PremiumPlacements";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Course from "./pages/Course";
import NotFound from "./pages/NotFound";
import Checkout from "./pages/Checkout";
import CheckoutSuccess from "./pages/CheckoutSuccess";
import CheckoutCanceled from "./pages/CheckoutCanceled";
import AdminLogin from "./pages/admin/Login";
import AdminDashboard from "./pages/admin/Dashboard";
import AuthCallback from "./pages/admin/Callback";
import AISalesDirector from "./pages/admin/AISalesDirector";
import CalendarDashboard from "./pages/admin/CalendarDashboard";
import UpcomingRecordings from "./pages/admin/UpcomingRecordings";
import ClientsManagement from "./pages/admin/ClientsManagement";
import ClientDetail from "./pages/admin/ClientDetail";
import BlogManagement from "./pages/admin/BlogManagement";
import BlogEditor from "./pages/admin/BlogEditor";
import VideoManagement from "./pages/admin/VideoManagement";
import PremiumPlacementsManagement from "./pages/admin/PremiumPlacementsManagement";
import CustomersManagement from "./pages/admin/CustomersManagement";
import LeadsManagement from "./pages/admin/LeadsManagement";
import Settings from "./pages/admin/Settings";
import Analytics from "./pages/admin/Analytics";
import AnalyticsTest from "./pages/AnalyticsTest";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/premium-placements" element={<PremiumPlacements />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/course" element={<Course />} />

            {/* Checkout routes */}
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/checkout/success" element={<CheckoutSuccess />} />
            <Route path="/checkout/canceled" element={<CheckoutCanceled />} />

            {/* Test route - no auth required */}
            <Route path="/test-analytics" element={<AnalyticsTest />} />

            {/* Admin routes */}
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/callback" element={<AuthCallback />} />
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/ai-sales-director"
              element={
                <ProtectedRoute>
                  <AISalesDirector />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/calendar"
              element={
                <ProtectedRoute>
                  <CalendarDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/upcoming"
              element={
                <ProtectedRoute>
                  <UpcomingRecordings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/clients"
              element={
                <ProtectedRoute>
                  <ClientsManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/clients/:id"
              element={
                <ProtectedRoute>
                  <ClientDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/blog"
              element={
                <ProtectedRoute>
                  <BlogManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/blog/new"
              element={
                <ProtectedRoute>
                  <BlogEditor />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/blog/:id/edit"
              element={
                <ProtectedRoute>
                  <BlogEditor />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/videos"
              element={
                <ProtectedRoute>
                  <VideoManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/premium-placements"
              element={
                <ProtectedRoute>
                  <PremiumPlacementsManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/customers"
              element={
                <ProtectedRoute>
                  <CustomersManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/leads"
              element={
                <ProtectedRoute>
                  <LeadsManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/analytics"
              element={
                <ProtectedRoute>
                  <Analytics />
                </ProtectedRoute>
              }
            />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
