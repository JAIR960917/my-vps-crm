import { useEffect, useState, useCallback, useMemo } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, Phone, User, UserCheck } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { formatPhoneBR } from "@/lib/phoneFormat";

type Renovacao = {
  id: string;
  data: Record<string, any>;
  status: string;
  assigned_to: string | null;
  created_by: string | null;
  valor: number;
  created_at: string;
  updated_at: string;
};

type CrmStatus = {
  id: string; key: string; label: string; position: number; color: string;
};

type Profile = { user_id: string; full_name: string; avatar_url?: string | null };

const colorMap: Record<string, { header: string; badge: string }> = {
  blue:    { header: "bg-blue-500",    badge: "bg-blue-500/15 text-blue-700 border-blue-300" },
  amber:   { header: "bg-amber-500",   badge: "bg-amber-500/15 text-amber-700 border-amber-300" },
  violet:  { header: "bg-violet-500",  badge: "bg-violet-500/15 text-violet-700 border-violet-300" },
  cyan:    { header: "bg-cyan-500",    badge: "bg-cyan-500/15 text-cyan-700 border-cyan-300" },
  emerald: { header: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-700 border-emerald-300" },
  red:     { header: "bg-red-500",     badge: "bg-red-500/15 text-red-700 border-red-300" },
};

export default function ActiveClientsPage() {
  const { user, isAdmin, isGerente } = useAuth();
  const [renovacoes, setRenovacoes] = useState<Renovacao[]>([]);
  const [statuses, setStatuses] = useState<CrmStatus[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Renovacao | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({ nome: "", telefone: "", descricao: "" });
  const [formStatus, setFormStatus] = useState("");
  const [formAssigned, setFormAssigned] = useState("");
  const [formValor, setFormValor] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileTab, setMobileTab] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const [{ data: items }, { data: sts }, { data: profs }] = await Promise.all([
      supabase.from("crm_renovacoes").select("*").order("updated_at", { ascending: false }),
      supabase.from("crm_renovacao_statuses").select("*").order("position"),
      supabase.rpc("get_profile_names"),
    ]);
    setRenovacoes((items || []) as Renovacao[]);
    setStatuses((sts || []) as CrmStatus[]);
    setProfiles((profs || []) as Profile[]);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (statuses.length > 0 && !mobileTab) setMobileTab(statuses[0].key);
  }, [statuses]);

  const statusOptions = statuses.map(s => s.key);

  const openCreate = (status?: string) => {
    setEditingItem(null);
    setFormData({ nome: "", telefone: "", descricao: "" });
    setFormStatus(status || statusOptions[0] || "novo");
    setFormAssigned("");
    setFormValor("");
    setDialogOpen(true);
  };

  const openEdit = (item: Renovacao) => {
    setEditingItem(item);
    setFormData(typeof item.data === "object" ? item.data : {});
    setFormStatus(item.status);
    setFormAssigned(item.assigned_to || "");
    setFormValor(String(item.valor || ""));
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const valor = parseFloat(formValor) || 0;

    if (editingItem) {
      const { error } = await supabase.from("crm_renovacoes").update({
        data: formData, status: formStatus, assigned_to: formAssigned || null, valor,
      }).eq("id", editingItem.id);
      if (error) toast.error("Erro ao atualizar");
      else toast.success("Renovação atualizada");
    } else {
      const { error } = await supabase.from("crm_renovacoes").insert({
        data: formData, status: formStatus, assigned_to: formAssigned || null,
        created_by: user?.id, valor,
      });
      if (error) toast.error("Erro ao criar renovação");
      else toast.success("Renovação criada");
    }
    setSaving(false);
    setDialogOpen(false);
    fetchAll();
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    const { error } = await supabase.from("crm_renovacoes").delete().eq("id", deleteConfirmId);
    if (error) toast.error("Erro ao excluir");
    else toast.success("Renovação excluída");
    setDeleteConfirmId(null);
    fetchAll();
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId;
    const itemId = result.draggableId;
    setRenovacoes(prev => prev.map(r => r.id === itemId ? { ...r, status: newStatus } : r));
    await supabase.from("crm_renovacoes").update({ status: newStatus }).eq("id", itemId);
  };

  const getProfileName = (userId: string | null) => {
    if (!userId) return "";
    return profiles.find(p => p.user_id === userId)?.full_name || "";
  };

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return renovacoes;
    const q = searchQuery.toLowerCase();
    return renovacoes.filter(r => {
      const d = r.data as Record<string, any>;
      return (d.nome || "").toLowerCase().includes(q)
        || (d.telefone || "").includes(q)
        || (d.descricao || "").toLowerCase().includes(q)
        || String(r.valor).includes(q);
    });
  }, [renovacoes, searchQuery]);

  const getByStatus = (key: string) => filteredItems.filter(r => r.status === key);

  const renderCard = (item: Renovacao) => {
    const d = item.data as Record<string, any>;
    return (
      <div className="bg-card border rounded-xl p-3 space-y-2 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{d.nome || "Sem nome"}</p>
            {d.telefone && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Phone className="h-3 w-3" />{formatPhoneBR(d.telefone)}
              </p>
            )}
          </div>
          <Badge variant="outline" className="text-xs shrink-0 ml-2">
            R$ {Number(item.valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </Badge>
        </div>
        {d.descricao && <p className="text-xs text-muted-foreground line-clamp-2">{d.descricao}</p>}
        {item.assigned_to && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <User className="h-3 w-3" />{getProfileName(item.assigned_to)}
          </p>
        )}
        <div className="flex gap-1 justify-end pt-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
            <Pencil className="h-3 w-3" />
          </Button>
          {(isAdmin || isGerente) && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteConfirmId(item.id)}>
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="h-6 w-6 text-primary" />
            <h1 className="text-xl sm:text-2xl font-bold">Renovação</h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {filteredItems.length} registro{filteredItems.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 h-9 w-full sm:w-48" />
          </div>
          <Button size="sm" onClick={() => openCreate()}>
            <Plus className="mr-2 h-4 w-4" />Nova Renovação
          </Button>
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="lg:hidden mb-3">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {statuses.map(status => {
            const count = getByStatus(status.key).length;
            const colors = colorMap[status.color] || colorMap.blue;
            return (
              <button key={status.key} onClick={() => setMobileTab(status.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  mobileTab === status.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                <div className={`h-2 w-2 rounded-full ${colors.header}`} />
                {status.label}
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  mobileTab === status.key ? "bg-primary-foreground/20 text-primary-foreground" : colors.badge
                }`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile column */}
      <div className="lg:hidden space-y-2 mb-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
        {statuses.filter(s => s.key === mobileTab).map(status => {
          const items = getByStatus(status.key);
          return (
            <div key={status.key}>
              {items.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Nenhuma renovação nesta coluna</p>}
              {items.map(r => <div key={r.id} className="mb-2">{renderCard(r)}</div>)}
              <button onClick={() => openCreate(status.key)} className="w-full py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-card rounded-lg border border-dashed border-border/50 hover:border-border transition-colors">
                + Adicionar renovação
              </button>
            </div>
          );
        })}
      </div>

      {/* Desktop Kanban */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="hidden lg:flex gap-3 overflow-x-auto pb-4" style={{ height: "calc(100vh - 200px)" }}>
          {statuses.map(status => {
            const items = getByStatus(status.key);
            const colors = colorMap[status.color] || colorMap.blue;
            return (
              <div key={status.key} className="flex-shrink-0 w-[280px] flex flex-col min-h-0">
                <div className="flex items-center gap-2 mb-2 px-1 flex-shrink-0">
                  <div className={`h-2.5 w-2.5 rounded-full ${colors.header}`} />
                  <h3 className="font-semibold text-sm text-foreground">{status.label}</h3>
                  <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>{items.length}</span>
                </div>
                <Droppable droppableId={status.key}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                      className={`flex-1 rounded-xl p-2 space-y-2 transition-colors overflow-y-auto min-h-0 ${
                        snapshot.isDraggingOver ? "bg-primary/5 border-2 border-dashed border-primary/30" : "bg-muted/50 border border-transparent"
                      }`}>
                      {items.map((r, index) => (
                        <Draggable key={r.id} draggableId={r.id} index={index}>
                          {(provided, snapshot) => (
                            <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                              className={snapshot.isDragging ? "opacity-90 rotate-2" : ""}>
                              {renderCard(r)}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      <button onClick={() => openCreate(status.key)} className="w-full py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-card rounded-lg border border-dashed border-border/50 hover:border-border transition-colors">
                        + Adicionar renovação
                      </button>
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar Renovação" : "Nova Renovação"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={formData.nome || ""} onChange={e => setFormData(p => ({ ...p, nome: e.target.value }))} placeholder="Nome do cliente" required />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={formData.telefone || ""} onChange={e => setFormData(p => ({ ...p, telefone: e.target.value }))} placeholder="(00) 00000-0000" />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={formValor} onChange={e => setFormValor(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={formData.descricao || ""} onChange={e => setFormData(p => ({ ...p, descricao: e.target.value }))} placeholder="Descrição..." rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statuses.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {(isAdmin || isGerente) && (
              <div className="space-y-2">
                <Label>Responsável</Label>
                <Select value={formAssigned} onValueChange={setFormAssigned}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={saving || !formData.nome?.trim()}>
              {saving ? "Salvando..." : editingItem ? "Atualizar" : "Criar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={open => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir renovação permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
