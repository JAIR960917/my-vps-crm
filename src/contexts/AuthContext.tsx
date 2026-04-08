import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "admin" | "vendedor" | "gerente";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  isAdmin: boolean;
  isGerente: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchRoles(userId: string): Promise<AppRole[]> {
  try {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    return (data || []).map((r) => r.role as AppRole);
  } catch {
    return [];
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    let mounted = true;

    // Step 1: Restore session from storage FIRST
    supabase.auth.getSession().then(async ({ data: { session: sess } }) => {
      if (!mounted) return;
      initialized.current = true;
      setSession(sess);
      if (sess?.user) {
        const r = await fetchRoles(sess.user.id);
        if (mounted) setRoles(r);
      }
      if (mounted) setLoading(false);
    }).catch(() => {
      if (mounted) {
        initialized.current = true;
        setLoading(false);
      }
    });

    // Step 2: Listen for SUBSEQUENT auth changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, sess) => {
        if (!mounted) return;
        // Skip the INITIAL_SESSION event — we handle it via getSession above
        if (event === "INITIAL_SESSION") return;

        setSession(sess);
        if (sess?.user) {
          const r = await fetchRoles(sess.user.id);
          if (mounted) setRoles(r);
        } else {
          setRoles([]);
        }
        // If getSession hasn't resolved yet, mark as ready now
        if (!initialized.current) {
          initialized.current = true;
          setLoading(false);
        }
      }
    );

    // Safety timeout
    const timeout = setTimeout(() => {
      if (mounted && !initialized.current) {
        initialized.current = true;
        setLoading(false);
      }
    }, 5000);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value: AuthContextType = {
    session,
    user: session?.user ?? null,
    roles,
    isAdmin: roles.includes("admin"),
    isGerente: roles.includes("gerente"),
    loading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
