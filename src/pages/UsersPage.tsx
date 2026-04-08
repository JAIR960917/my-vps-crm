import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus } from "lucide-react";

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
  const [selectedCompany, setSelectedCompany] = useState("");

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
      setName("");
      setEmail("");
      setPassword("");
      setRole("vendedor");
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

  // Available role options for gerentes (cannot create admins)
  const roleOptions = isAdmin
    ? [{ value: "admin", label: "Admin" }, { value: "gerente", label: "Gerente" }, { value: "vendedor", label: "Vendedor" }]
    : [{ value: "gerente", label: "Gerente" }, { value: "vendedor", label: "Vendedor" }];

  if (!canManage) {
    return <AppLayout><p className="text-muted-foreground">Acesso restrito a administradores e gerentes.</p></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            {isGerente && !isAdmin ? "Usuários da sua empresa" : "Gerencie os usuários do sistema"}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Novo Usuário</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Usuário</DialogTitle>
            </DialogHeader>
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

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Papel</TableHead>
              {isAdmin && <TableHead>Empresa</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.full_name || "—"}</TableCell>
                <TableCell>{p.email}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {getRoles(p.user_id).map((r) => (
                      <Badge key={r} variant={roleBadgeVariant(r) as any}>{r}</Badge>
                    ))}
                  </div>
                </TableCell>
                {isAdmin && (
                  <TableCell>
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
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
}
