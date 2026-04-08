import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, User } from "lucide-react";

type Company = { id: string; name: string };

type Profile = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  company_id: string | null;
};

type UserRole = {
  user_id: string;
  role: string;
};

export default function UsersPage() {
  const { isAdmin, isGerente } = useAuth();
  const canManage = isAdmin || isGerente;

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("vendedor");
  const [creating, setCreating] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);

  const fetchData = async () => {
    const [{ data: p }, { data: r }, { data: c }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at"),
      supabase.from("user_roles").select("*"),
      supabase.from("companies").select("id, name").order("name"),
    ]);
    setProfiles(p || []);
    setUserRoles(r || []);
    setCompanies(c || []);
  };

  useEffect(() => { fetchData(); }, []);

  const getRoles = (userId: string) =>
    userRoles.filter((r) => r.user_id === userId).map((r) => r.role);

  const getCompanyName = (companyId: string | null) =>
    companies.find((c) => c.id === companyId)?.name || "—";

  const handleAssignCompany = async (profileUserId: string, companyId: string) => {
    const val = companyId === "__none__" ? null : companyId;
    const { error } = await supabase.from("profiles").update({ company_id: val }).eq("user_id", profileUserId);
    if (error) toast.error("Erro ao atribuir empresa");
    else { toast.success("Empresa atribuída"); fetchData(); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setCreating(true);

    const { data, error } = await supabase.functions.invoke("create-user", {
      body: { email, password, full_name: name, role },
    });

    if (error || data?.error) {
      toast.error(data?.error || "Erro ao criar usuário");
    } else {
      toast.success("Usuário criado");
      setOpen(false);
      setName(""); setEmail(""); setPassword(""); setRole("vendedor");
      fetchData();
    }
    setCreating(false);
  };

  const roleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin": return "default";
      case "gerente": return "secondary";
      default: return "outline";
    }
  };

  const roleOptions = isAdmin
    ? [{ value: "admin", label: "Admin" }, { value: "gerente", label: "Gerente" }, { value: "vendedor", label: "Vendedor" }]
    : [{ value: "gerente", label: "Gerente" }, { value: "vendedor", label: "Vendedor" }];

  if (!canManage) {
    return <AppLayout><p className="text-muted-foreground">Acesso restrito a administradores e gerentes.</p></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Usuários</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {isGerente && !isAdmin ? "Usuários da sua empresa" : "Gerencie os usuários do sistema"}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" />Novo Usuário</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar Usuário</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome completo</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Senha</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              <div className="space-y-2">
                <Label>Papel</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? "Criando..." : "Criar Usuário"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block rounded-xl border bg-card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 text-sm font-medium text-muted-foreground">Nome</th>
              <th className="text-left p-3 text-sm font-medium text-muted-foreground">Email</th>
              <th className="text-left p-3 text-sm font-medium text-muted-foreground">Papel</th>
              {isAdmin && <th className="text-left p-3 text-sm font-medium text-muted-foreground">Empresa</th>}
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="p-3 font-medium">{p.full_name || "—"}</td>
                <td className="p-3 text-muted-foreground text-sm">{p.email}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    {getRoles(p.user_id).map((r) => (
                      <Badge key={r} variant={roleBadgeVariant(r) as any}>{r}</Badge>
                    ))}
                  </div>
                </td>
                {isAdmin && (
                  <td className="p-3">
                    <Select value={p.company_id || "__none__"} onValueChange={(v) => handleAssignCompany(p.user_id, v)}>
                      <SelectTrigger className="w-40 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhuma</SelectItem>
                        {companies.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {profiles.map((p) => (
          <div key={p.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{p.full_name || "—"}</p>
                <p className="text-xs text-muted-foreground truncate">{p.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-2">
              {getRoles(p.user_id).map((r) => (
                <Badge key={r} variant={roleBadgeVariant(r) as any} className="text-xs">{r}</Badge>
              ))}
            </div>
            {isAdmin && (
              <Select value={p.company_id || "__none__"} onValueChange={(v) => handleAssignCompany(p.user_id, v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma empresa</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!isAdmin && p.company_id && (
              <p className="text-xs text-muted-foreground">Empresa: {getCompanyName(p.company_id)}</p>
            )}
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
