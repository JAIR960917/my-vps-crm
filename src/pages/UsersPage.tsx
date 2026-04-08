import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, User, Pencil, Trash2, KeyRound, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
  const { isAdmin, isGerente, user } = useAuth();
  const canManage = isAdmin || isGerente;

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  // Create dialog
  const [openCreate, setOpenCreate] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("vendedor");
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [openEdit, setOpenEdit] = useState(false);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editCompanyId, setEditCompanyId] = useState<string>("__none__");
  const [saving, setSaving] = useState(false);

  // Reset password dialog
  const [openResetPw, setOpenResetPw] = useState(false);
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resettingPw, setResettingPw] = useState(false);

  // Delete dialog
  const [openDelete, setOpenDelete] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  // ── CREATE ──
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
      setOpenCreate(false);
      setName(""); setEmail(""); setPassword(""); setRole("vendedor");
      fetchData();
    }
    setCreating(false);
  };

  // ── EDIT ──
  const openEditDialog = (p: Profile) => {
    setEditTarget(p);
    setEditName(p.full_name);
    const roles = getRoles(p.user_id);
    setEditRole(roles[0] || "vendedor");
    setEditCompanyId(p.company_id || "__none__");
    setOpenEdit(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("manage-user", {
      body: {
        action: "update",
        target_user_id: editTarget.user_id,
        full_name: editName,
        role: editRole,
        ...(isAdmin ? { company_id: editCompanyId === "__none__" ? null : editCompanyId } : {}),
      },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Erro ao atualizar");
    } else {
      toast.success("Usuário atualizado");
      setOpenEdit(false);
      fetchData();
    }
    setSaving(false);
  };

  // ── RESET PASSWORD ──
  const openResetDialog = (p: Profile) => {
    setResetTarget(p);
    setNewPassword("");
    setOpenResetPw(true);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResettingPw(true);
    const { data, error } = await supabase.functions.invoke("manage-user", {
      body: { action: "reset_password", target_user_id: resetTarget.user_id, new_password: newPassword },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Erro ao alterar senha");
    } else {
      toast.success("Senha alterada com sucesso");
      setOpenResetPw(false);
    }
    setResettingPw(false);
  };

  // ── DELETE ──
  const openDeleteDialog = (p: Profile) => {
    setDeleteTarget(p);
    setOpenDelete(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke("manage-user", {
      body: { action: "delete", target_user_id: deleteTarget.user_id },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Erro ao excluir");
    } else {
      toast.success("Usuário excluído");
      setOpenDelete(false);
      fetchData();
    }
    setDeleting(false);
  };

  const canManageUser = (p: Profile) => {
    // Can't manage yourself via these controls
    if (p.user_id === user?.id) return false;
    // Admin can manage everyone
    if (isAdmin) return true;
    // Gerente can manage non-admins (server enforces company scope)
    const targetRoles = getRoles(p.user_id);
    if (targetRoles.includes("admin")) return false;
    return true;
  };

  const ActionMenu = ({ profile }: { profile: Profile }) => {
    if (!canManageUser(profile)) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openEditDialog(profile)}>
            <Pencil className="mr-2 h-4 w-4" />Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openResetDialog(profile)}>
            <KeyRound className="mr-2 h-4 w-4" />Alterar Senha
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onClick={() => openDeleteDialog(profile)}>
            <Trash2 className="mr-2 h-4 w-4" />Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

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
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
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
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
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
              <th className="text-right p-3 text-sm font-medium text-muted-foreground">Ações</th>
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
                  <td className="p-3 text-sm text-muted-foreground">
                    {companies.find((c) => c.id === p.company_id)?.name || "—"}
                  </td>
                )}
                <td className="p-3 text-right">
                  <ActionMenu profile={p} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {profiles.map((p) => (
          <div key={p.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{p.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                </div>
              </div>
              <ActionMenu profile={p} />
            </div>
            <div className="flex items-center gap-2">
              {getRoles(p.user_id).map((r) => (
                <Badge key={r} variant={roleBadgeVariant(r) as any} className="text-xs">{r}</Badge>
              ))}
              {p.company_id && (
                <span className="text-xs text-muted-foreground ml-auto truncate">
                  {companies.find((c) => c.id === p.company_id)?.name}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Usuário</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roleOptions.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isAdmin && (
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Select value={editCompanyId} onValueChange={setEditCompanyId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={openResetPw} onOpenChange={setOpenResetPw}>
        <DialogContent>
          <DialogHeader><DialogTitle>Alterar Senha</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            Definir nova senha para <strong>{resetTarget?.full_name || resetTarget?.email}</strong>
          </p>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} placeholder="Mínimo 8 caracteres" />
            </div>
            <Button type="submit" className="w-full" disabled={resettingPw}>
              {resettingPw ? "Alterando..." : "Alterar Senha"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={openDelete} onOpenChange={setOpenDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir Usuário</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir <strong>{deleteTarget?.full_name || deleteTarget?.email}</strong>? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpenDelete(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
