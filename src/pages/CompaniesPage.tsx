import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";

type Company = {
  id: string;
  name: string;
  cnpj: string | null;
  phone: string | null;
  address: string | null;
};

export default function CompaniesPage() {
  const { isAdmin } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const fetchCompanies = async () => {
    const { data } = await supabase.from("companies").select("*").order("name");
    setCompanies(data || []);
  };

  useEffect(() => { fetchCompanies(); }, []);

  const resetForm = () => {
    setName(""); setCnpj(""); setPhone(""); setAddress("");
    setEditingId(null);
  };

  const openEdit = (c: Company) => {
    setEditingId(c.id);
    setName(c.name);
    setCnpj(c.cnpj || "");
    setPhone(c.phone || "");
    setAddress(c.address || "");
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name, cnpj: cnpj || null, phone: phone || null, address: address || null };

    if (editingId) {
      const { error } = await supabase.from("companies").update(payload).eq("id", editingId);
      if (error) { toast.error("Erro ao atualizar empresa"); return; }
      toast.success("Empresa atualizada");
    } else {
      const { error } = await supabase.from("companies").insert(payload);
      if (error) { toast.error("Erro ao criar empresa"); return; }
      toast.success("Empresa criada");
    }
    setOpen(false);
    resetForm();
    fetchCompanies();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("companies").delete().eq("id", id);
    if (error) toast.error("Erro ao remover empresa");
    else { toast.success("Empresa removida"); fetchCompanies(); }
  };

  if (!isAdmin) {
    return <AppLayout><p className="text-muted-foreground">Acesso restrito a administradores.</p></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Empresas</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Gerencie as empresas cadastradas</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" />Nova Empresa</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Empresa" : "Criar Empresa"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Nome da empresa" />
              </div>
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-2">
                <Label>Endereço</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Endereço completo" />
              </div>
              <Button type="submit" className="w-full">
                {editingId ? "Atualizar" : "Criar"}
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
              <th className="text-left p-3 text-sm font-medium text-muted-foreground">CNPJ</th>
              <th className="text-left p-3 text-sm font-medium text-muted-foreground">Telefone</th>
              <th className="text-left p-3 text-sm font-medium text-muted-foreground">Endereço</th>
              <th className="p-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && (
              <tr><td colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma empresa cadastrada</td></tr>
            )}
            {companies.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3 text-muted-foreground text-sm">{c.cnpj || "—"}</td>
                <td className="p-3 text-muted-foreground text-sm">{c.phone || "—"}</td>
                <td className="p-3 text-muted-foreground text-sm">{c.address || "—"}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {companies.length === 0 && (
          <div className="text-center text-muted-foreground py-8 border rounded-xl bg-card">Nenhuma empresa cadastrada</div>
        )}
        {companies.map((c) => (
          <div key={c.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary shrink-0" />
                <span className="font-medium">{c.name}</span>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(c.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              {c.cnpj && <p><span className="font-medium">CNPJ:</span> {c.cnpj}</p>}
              {c.phone && <p><span className="font-medium">Tel:</span> {c.phone}</p>}
              {c.address && <p><span className="font-medium">End:</span> {c.address}</p>}
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
