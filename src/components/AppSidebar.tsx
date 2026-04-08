import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, LogOut, Columns3, Building2, FileText, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  path: string;
  label: string;
  icon: any;
  roles?: ("admin" | "gerente")[];
};

const navItems: NavItem[] = [
  { path: "/", label: "Leads", icon: LayoutDashboard },
  { path: "/usuarios", label: "Usuários", icon: Users, roles: ["admin", "gerente"] },
  { path: "/empresas", label: "Empresas", icon: Building2, roles: ["admin"] },
  { path: "/colunas", label: "Colunas CRM", icon: Columns3, roles: ["admin"] },
  { path: "/formulario", label: "Formulário", icon: FileText, roles: ["admin"] },
];

interface Props {
  onNavigate?: () => void;
}

export default function AppSidebar({ onNavigate }: Props) {
  const { user, isAdmin, isGerente, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const canSee = (item: NavItem) => {
    if (!item.roles) return true;
    if (isAdmin && item.roles.includes("admin")) return true;
    if (isGerente && item.roles.includes("gerente")) return true;
    return false;
  };

  const handleNav = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  const handleSignOut = async () => {
    if (signingOut) return;

    setSigningOut(true);
    try {
      await signOut();
      onNavigate?.();
      navigate("/login", { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <aside className="flex h-screen w-60 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
          <LayoutDashboard className="h-4 w-4 text-sidebar-primary-foreground" />
        </div>
        <span className="text-lg font-bold text-sidebar-primary-foreground">Ótica Joonker</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {navItems
          .filter(canSee)
          .map((item) => (
            <button
              key={item.path}
              onClick={() => handleNav(item.path)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                location.pathname === item.path
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/50"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
      </nav>

      <div className="space-y-2 border-t border-sidebar-border px-3 py-4">
        <button
          onClick={() => {
            const html = document.documentElement;
            const isDark = html.classList.contains("dark");
            html.classList.toggle("dark", !isDark);
            localStorage.setItem("theme", isDark ? "light" : "dark");
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/50"
        >
          <Sun className="hidden h-4 w-4 dark:block" />
          <Moon className="h-4 w-4 dark:hidden" />
          <span className="dark:hidden">Modo Escuro</span>
          <span className="hidden dark:inline">Modo Claro</span>
        </button>
        <div className="truncate px-3 text-xs text-sidebar-foreground/60">
          {user?.email}
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/50 disabled:pointer-events-none disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" />
          {signingOut ? "Saindo..." : "Sair"}
        </button>
      </div>
    </aside>
  );
}
