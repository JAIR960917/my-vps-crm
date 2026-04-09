import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SystemSettingsProvider } from "@/contexts/SystemSettingsContext";
import Login from "./pages/Login";
import LeadsPage from "./pages/LeadsPage";
import UsersPage from "./pages/UsersPage";
import ColumnsPage from "./pages/ColumnsPage";
import CompaniesPage from "./pages/CompaniesPage";
import FormBuilderPage from "./pages/FormBuilderPage";
import NewLeadPage from "./pages/NewLeadPage";
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";
import InstallPage from "./pages/InstallPage";
import NotificationSettingsPage from "./pages/NotificationSettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando...</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando...</div>;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/" element={<ProtectedRoute><LeadsPage /></ProtectedRoute>} />
      <Route path="/usuarios" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
      <Route path="/empresas" element={<ProtectedRoute><CompaniesPage /></ProtectedRoute>} />
      <Route path="/colunas" element={<ProtectedRoute><ColumnsPage /></ProtectedRoute>} />
      <Route path="/formulario" element={<ProtectedRoute><FormBuilderPage /></ProtectedRoute>} />
      <Route path="/novo-lead" element={<ProtectedRoute><NewLeadPage /></ProtectedRoute>} />
      <Route path="/configuracoes" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/perfil" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/notificacoes" element={<ProtectedRoute><NotificationSettingsPage /></ProtectedRoute>} />
      <Route path="/instalar" element={<InstallPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SystemSettingsProvider>
            <AppRoutes />
          </SystemSettingsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
