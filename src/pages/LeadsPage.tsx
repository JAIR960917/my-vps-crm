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
import { Plus, Pencil, Trash2 } from "lucide-react";

type CrmColumn = {
  id: string;
  name: string;
  field_key: string;
  field_type: string;
  options: any;
  position: number;
  is_required: boolean;
};

type Lead = {
  id: string;
  data: Record<string, any>;
  assigned_to: string | null;
  created_by: string;
  status: string;
  created_at: string;
};

type Profile = { user_id: string; full_name: string; email: string };

const STATUS_OPTIONS = ["novo", "em_contato", "qualificado", "proposta", "fechado", "perdido"];
const statusLabels: Record<string, string> = {
  novo: "Novo", em_contato: "Em Contato", qualificado: "Qualificado",
  proposta: "Proposta", fechado: "Fechado", perdido: "Perdido",
};

export default function LeadsPage() {
  const { user, isAdmin, isGerente } = useAuth();
  const [columns, setColumns] = useState<CrmColumn[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [open, setOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [formStatus, setFormStatus] = useState("novo");
  const [formAssigned, setFormAssigned] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    const [{ data: cols }, { data: lds }, { data: profs }] = await Promise.all([
      supabase.from("crm_columns").select("*").order("position"),
      supabase.from("crm_leads").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id, full_name, email"),
    ]);
    setColumns(cols || []);
    setLeads((lds || []) as Lead[]);
    setProfiles(profs || []);
  };

  useEffect(() => { fetchAll(); }, []);

  const openCreate = () => {
    setEditingLead(null);
    setFormData({});
    setFormStatus("novo");
    setFormAssigned("");
    setOpen(true);
  };

  const openEdit = (lead: Lead) => {
    setEditingLead(lead);
    setFormData(typeof lead.data === "object" ? lead.data : {});
    setFormStatus(lead.status);
    setFormAssigned(lead.assigned_to || "");
    setOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (editingLead) {
      const { error } = await supabase
        .from("crm_leads")
        .update({
          data: formData,
          status: formStatus,
          assigned_to: formAssigned || null,
        })
        .eq("id", editingLead.id);
      if (error) toast.error("Erro ao atualizar");
      else toast.success("Lead atualizado");
    } else {
      const { error } = await supabase.from("crm_leads").insert({
        data: formData,
        status: formStatus,
        assigned_to: formAssigned || null,
        created_by: user!.id,
      });
      if (error) toast.error("Erro ao criar lead");
      else toast.success("Lead criado");
    }

    setSaving(false);
    setOpen(false);
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("crm_leads").delete().eq("id", id);
    if (error) toast.error("Erro ao remover");
    else { toast.success("Lead removido"); fetchAll(); }
  };

  const getProfileName = (userId: string | null) => {
    if (!userId) return "—";
    const p = profiles.find((p) => p.user_id === userId);
    return p?.full_name || p?.email || "—";
  };

  const renderFieldInput = (col: CrmColumn) => {
    const value = formData[col.field_key] || "";
    if (col.field_type === "select" && Array.isArray(col.options)) {
      return (
        <Select value={value} onValueChange={(v) => setFormData({ ...formData, [col.field_key]: v })}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {(col.options as string[]).map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    const inputType = col.field_type === "number" ? "number" : col.field_type === "date" ? "date" : col.field_type === "email" ? "email" : "text";
    return (
      <Input
        type={inputType}
        value={value}
        onChange={(e) => setFormData({ ...formData, [col.field_key]: e.target.value })}
        required={col.is_required}
      />
    );
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "fechado": return "default";
      case "perdido": return "destructive";
      case "qualificado": return "secondary";
      default: return "outline";
    }
  };

  return (
    <AppLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground">{leads.length} lead{leads.length !== 1 ? "s" : ""} cadastrado{leads.length !== 1 ? "s" : ""}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Novo Lead</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingLead ? "Editar Lead" : "Novo Lead"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              {columns.map((col) => (
                <div key={col.id} className="space-y-2">
                  <Label>{col.name}{col.is_required && " *"}</Label>
                  {renderFieldInput(col)}
                </div>
              ))}
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Atribuído a</Label>
                <Select value={formAssigned} onValueChange={setFormAssigned}>
                  <SelectTrigger><SelectValue placeholder="Ninguém" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Ninguém</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.full_name || p.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Salvando..." : editingLead ? "Atualizar" : "Criar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.id}>{col.name}</TableHead>
              ))}
              <TableHead>Status</TableHead>
              <TableHead>Atribuído</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 3} className="text-center text-muted-foreground py-8">
                  Nenhum lead cadastrado
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => {
                const data = typeof lead.data === "object" ? lead.data as Record<string, any> : {};
                return (
                  <TableRow key={lead.id}>
                    {columns.map((col) => (
                      <TableCell key={col.id}>{data[col.field_key] || "—"}</TableCell>
                    ))}
                    <TableCell>
                      <Badge variant={statusColor(lead.status) as any}>
                        {statusLabels[lead.status] || lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{getProfileName(lead.assigned_to)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(lead)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(lead.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
}
