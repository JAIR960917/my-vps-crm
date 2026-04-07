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
import { Plus, Trash2 } from "lucide-react";

type Profile = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
};

type UserRole = {
  user_id: string;
  role: string;
};

export default function UsersPage() {
  const { isAdmin } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("vendedor");
  const [creating, setCreating] = useState(false);

  const fetchData = async () => {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at"),
      supabase.from("user_roles").select("*"),
    ]);
    setProfiles(p || []);
    setUserRoles(r || []);
  };

  useEffect(() => { fetchData(); }, []);

  const getRoles = (userId: string) =>
    userRoles.filter((r) => r.user_id === userId).map((r) => r.role);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
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

  if (!isAdmin) {
    return <AppLayout><p className="text-muted-foreground">Acesso restrito a administradores.</p></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-sm text-muted-foreground">Gerencie os usuários do sistema</p>
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
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="gerente">Gerente</SelectItem>
                    <SelectItem value="vendedor">Vendedor</SelectItem>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
}
