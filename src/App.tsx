import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SystemSettingsProvider } from "@/contexts/SystemSettingsContext";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import Login from "./pages/Login";
import LeadsPage from "./pages/LeadsPage";
import UsersPage from "./pages/UsersPage";
import ColumnsPage from "./pages/ColumnsPage";
import CompaniesPage from "./pages/CompaniesPage";
import FormBuilderPage from "./pages/FormBuilderPage";
import RenovacaoFormBuilderPage from "./pages/RenovacaoFormBuilderPage";
import NewLeadPage from "./pages/NewLeadPage";
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";
import InstallPage from "./pages/InstallPage";
import NotificationSettingsPage from "./pages/NotificationSettingsPage";
import WhatsAppPage from "./pages/WhatsAppPage";
import AppointmentsPage from "./pages/AppointmentsPage";
import ActiveClientsPage from "./pages/ActiveClientsPage";
import ImportLeadsPage from "./pages/ImportLeadsPage";
import CobrancasPage from "./pages/CobrancasPage";
import SSoticaIntegrationsPage from "./pages/SSoticaIntegrationsPage";
import TransitionLogsPage from "./pages/TransitionLogsPage";
import DashboardPage from "./pages/DashboardPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function PushNotificationsBootstrap() {
  usePushNotifications();
  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando...</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Allowed paths for financeiro role (restrict everything else)
const FINANCEIRO_ALLOWED = new Set([
  "/cobrancas",
  "/perfil",
  "/notificacoes",
  "/instalar",
]);

function RoleGate({ children }: { children: React.ReactNode }) {
  const { session, loading, isFinanceiro, isAdmin, isGerente } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando...</div>;
  if (!session) return <Navigate to="/login" replace />;

  const path = window.location.pathname;

  // Financeiro role (without admin/gerente) is restricted to a small set of pages
  if (isFinanceiro && !isAdmin && !isGerente) {
    if (!FINANCEIRO_ALLOWED.has(path)) {
      return <Navigate to="/cobrancas" replace />;
    }
  }

  // Admin opens the app on the dashboard by default
  if (isAdmin && path === "/") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, isAdmin } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando...</div>;
  if (session) return <Navigate to={isAdmin ? "/dashboard" : "/"} replace />;
  return <>{children}</>;
}

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/" element={<RoleGate><LeadsPage /></RoleGate>} />
      <Route path="/usuarios" element={<RoleGate><UsersPage /></RoleGate>} />
      <Route path="/empresas" element={<RoleGate><CompaniesPage /></RoleGate>} />
      <Route path="/colunas" element={<RoleGate><ColumnsPage /></RoleGate>} />
      <Route path="/formulario" element={<RoleGate><FormBuilderPage /></RoleGate>} />
      <Route path="/formulario-renovacao" element={<RoleGate><RenovacaoFormBuilderPage /></RoleGate>} />
      <Route path="/novo-lead" element={<RoleGate><NewLeadPage /></RoleGate>} />
      <Route path="/configuracoes" element={<RoleGate><SettingsPage /></RoleGate>} />
      <Route path="/perfil" element={<RoleGate><ProfilePage /></RoleGate>} />
      <Route path="/notificacoes" element={<RoleGate><NotificationSettingsPage /></RoleGate>} />
      <Route path="/whatsapp" element={<RoleGate><WhatsAppPage /></RoleGate>} />
      <Route path="/agendamentos" element={<RoleGate><AppointmentsPage /></RoleGate>} />
      <Route path="/clientes-ativos" element={<RoleGate><ActiveClientsPage /></RoleGate>} />
      <Route path="/importar" element={<RoleGate><ImportLeadsPage /></RoleGate>} />
      <Route path="/cobrancas" element={<RoleGate><CobrancasPage /></RoleGate>} />
      <Route path="/integracoes-ssotica" element={<RoleGate><SSoticaIntegrationsPage /></RoleGate>} />
      <Route path="/logs-movimentacao" element={<RoleGate><TransitionLogsPage /></RoleGate>} />
      <Route path="/dashboard" element={<RoleGate><DashboardPage /></RoleGate>} />
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
          <PushNotificationsBootstrap />
          <SystemSettingsProvider>
            <AppRoutes />
          </SystemSettingsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
