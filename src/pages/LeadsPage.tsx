import { useEffect, useState, useRef } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Pencil, Check, X, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LeadCard from "@/components/leads/LeadCard";
import LeadFormDialog from "@/components/leads/LeadFormDialog";
import LeadHistoryDialog from "@/components/leads/LeadHistoryDialog";

type CrmColumn = {
  id: string; name: string; field_key: string; field_type: string;
  options: any; position: number; is_required: boolean;
};
type Lead = {
  id: string; data: Record<string, any>; assigned_to: string | null;
  created_by: string; status: string; created_at: string;
};
type Profile = { user_id: string; full_name: string; email?: string };
type CrmStatus = {
  id: string; key: string; label: string; position: number; color: string;
};
type Company = { id: string; name: string };

const colorMap: Record<string, { header: string; badge: string }> = {
  blue:    { header: "bg-blue-500",    badge: "bg-blue-500/15 text-blue-700 border-blue-300" },
  amber:   { header: "bg-amber-500",   badge: "bg-amber-500/15 text-amber-700 border-amber-300" },
  violet:  { header: "bg-violet-500",  badge: "bg-violet-500/15 text-violet-700 border-violet-300" },
  cyan:    { header: "bg-cyan-500",    badge: "bg-cyan-500/15 text-cyan-700 border-cyan-300" },
  emerald: { header: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-700 border-emerald-300" },
  red:     { header: "bg-red-500",     badge: "bg-red-500/15 text-red-700 border-red-300" },
};

export default function LeadsPage() {
  const { user, isAdmin } = useAuth();
  const [columns, setColumns] = useState<CrmColumn[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [statuses, setStatuses] = useState<CrmStatus[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [currentUserName, setCurrentUserName] = useState("");
  const [open, setOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [formStatus, setFormStatus] = useState("novo");
  const [formAssigned, setFormAssigned] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLeadId, setHistoryLeadId] = useState<string | null>(null);
  const [historyLeadName, setHistoryLeadName] = useState("");
  // New status column dialog state
  const [newColOpen, setNewColOpen] = useState(false);
  const [newColLabel, setNewColLabel] = useState("");
  const [newColColor, setNewColColor] = useState("blue");
  const [savingCol, setSavingCol] = useState(false);

  // Inline rename state
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const fetchAll = async () => {
    const [{ data: cols }, { data: lds }, { data: profs }, { data: sts }, { data: comps }] = await Promise.all([
      supabase.from("crm_columns").select("*").order("position"),
      supabase.from("crm_leads").select("*").order("updated_at", { ascending: true }),
      supabase.rpc("get_profile_names"),
      supabase.from("crm_statuses").select("*").order("position"),
      supabase.from("companies").select("id, name").order("name"),
    ]);
    setColumns(cols || []);
    setLeads((lds || []) as Lead[]);
    setProfiles(profs || []);
    setStatuses((sts || []) as CrmStatus[]);
    setCompanies((comps || []) as Company[]);
    // Set current user name
    const me = (profs || []).find((p: Profile) => p.user_id === user?.id);
    setCurrentUserName(me?.full_name || user?.email || "");
  };

  useEffect(() => { fetchAll(); }, []);

  // Derive labels and options from DB statuses
  const statusOptions = statuses.map(s => s.key);
  const statusLabels = Object.fromEntries(statuses.map(s => [s.key, s.label]));

  const openCreate = (status?: string) => {
    setEditingLead(null);
    setFormData({});
    setFormStatus(status || statusOptions[0] || "novo");
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
      const { error } = await supabase.from("crm_leads").update({
        data: formData, status: formStatus, assigned_to: formAssigned || null,
      }).eq("id", editingLead.id);
      if (error) toast.error("Erro ao atualizar");
      else toast.success("Lead atualizado");
    } else {
      const { error } = await supabase.from("crm_leads").insert({
        data: formData, status: formStatus,
        assigned_to: formAssigned || null, created_by: user!.id,
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

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId;
    const leadId = result.draggableId;
    if (newStatus === result.source.droppableId) return;

    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, status: newStatus } : l));

    const { error } = await supabase.from("crm_leads").update({ status: newStatus }).eq("id", leadId);
    if (error) {
      toast.error("Erro ao mover lead");
      fetchAll();
    }
  };

  const startRename = (status: CrmStatus) => {
    setRenamingKey(status.key);
    setRenameValue(status.label);
    setTimeout(() => renameInputRef.current?.focus(), 50);
  };

  const saveRename = async () => {
    if (!renamingKey || !renameValue.trim()) return;
    const { error } = await supabase
      .from("crm_statuses")
      .update({ label: renameValue.trim() })
      .eq("key", renamingKey);
    if (error) toast.error("Erro ao renomear");
    else {
      toast.success("Coluna renomeada");
      fetchAll();
    }
    setRenamingKey(null);
  };

  const cancelRename = () => setRenamingKey(null);

  const handleCreateStatus = async () => {
    if (!newColLabel.trim()) return;
    setSavingCol(true);
    const key = newColLabel.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const maxPos = statuses.length > 0 ? Math.max(...statuses.map(s => s.position)) + 1 : 0;
    const { error } = await supabase.from("crm_statuses").insert({
      key, label: newColLabel.trim(), color: newColColor, position: maxPos,
    });
    if (error) toast.error("Erro ao criar coluna");
    else { toast.success("Coluna criada"); fetchAll(); }
    setSavingCol(false);
    setNewColOpen(false);
    setNewColLabel("");
    setNewColColor("blue");
  };

  const handleDeleteStatus = async (statusKey: string) => {
    const leadsInCol = leads.filter(l => l.status === statusKey);
    if (leadsInCol.length > 0) {
      toast.error("Remova os leads desta coluna antes de excluí-la");
      return;
    }
    const { error } = await supabase.from("crm_statuses").delete().eq("key", statusKey);
    if (error) toast.error("Erro ao excluir coluna");
    else { toast.success("Coluna excluída"); fetchAll(); }
  };

  const getLeadsByStatus = (status: string) => leads.filter((l) => l.status === status);

  return (
    <AppLayout>
      <div className="mb-3 sm:mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Leads</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {leads.length} lead{leads.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => openCreate()}>
          <Plus className="mr-1 sm:mr-2 h-4 w-4" /><span className="hidden sm:inline">Novo </span>Lead
        </Button>
        {isAdmin && (
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => setNewColOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /><span className="hidden sm:inline">Nova </span>Coluna
          </Button>
        )}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0" style={{ minHeight: "calc(100vh - 200px)" }}>
          {statuses.map((status) => {
            const statusLeads = getLeadsByStatus(status.key);
            const colors = colorMap[status.color] || colorMap.blue;
            return (
              <div key={status.key} className="flex-shrink-0 w-[240px] sm:w-[280px] flex flex-col">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className={`h-2.5 w-2.5 rounded-full ${colors.header}`} />
                  {renamingKey === status.key ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <Input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename();
                          if (e.key === "Escape") cancelRename();
                        }}
                        className="h-6 text-sm py-0 px-1"
                      />
                      <button onClick={saveRename} className="text-emerald-500 hover:text-emerald-400 shrink-0">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={cancelRename} className="text-muted-foreground hover:text-foreground shrink-0">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <h3 className="font-semibold text-sm text-foreground">{status.label}</h3>
                      {isAdmin && (
                        <button onClick={() => startRename(status)} className="text-muted-foreground hover:text-foreground">
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => handleDeleteStatus(status.key)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </>
                  )}
                  <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
                    {statusLeads.length}
                  </span>
                </div>

                <Droppable droppableId={status.key}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 rounded-xl p-2 space-y-2 transition-colors ${
                        snapshot.isDraggingOver ? "bg-primary/5 border-2 border-dashed border-primary/30" : "bg-muted/50 border border-transparent"
                      }`}
                    >
                      {statusLeads.map((lead, index) => (
                        <Draggable key={lead.id} draggableId={lead.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={snapshot.isDragging ? "opacity-90 rotate-2" : ""}
                            >
                              <LeadCard
                                lead={lead}
                                columns={columns}
                                profiles={profiles}
                                isAdmin={isAdmin}
                                onEdit={() => openEdit(lead)}
                                onDelete={() => handleDelete(lead.id)}
                                onHistory={() => {
                                  const data = typeof lead.data === "object" ? lead.data as Record<string, any> : {};
                                  setHistoryLeadId(lead.id);
                                  setHistoryLeadName(data.nome_lead || (columns[0] ? data[columns[0].field_key] : null) || "Lead");
                                  setHistoryOpen(true);
                                }}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}

                      <button
                        onClick={() => openCreate(status.key)}
                        className="w-full py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-card rounded-lg border border-dashed border-border/50 hover:border-border transition-colors"
                      >
                        + Adicionar lead
                      </button>
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      <LeadFormDialog
        open={open}
        onOpenChange={setOpen}
        profiles={profiles}
        companies={companies}
        currentUserName={currentUserName}
        formData={formData}
        setFormData={setFormData}
        formStatus={formStatus}
        setFormStatus={setFormStatus}
        formAssigned={formAssigned}
        setFormAssigned={setFormAssigned}
        saving={saving}
        isEditing={!!editingLead}
        onSubmit={handleSave}
        statusOptions={statusOptions}
        statusLabels={statusLabels}
      />

      <LeadHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        leadId={historyLeadId}
        leadName={historyLeadName}
        profiles={profiles}
        onNoteAdded={fetchAll}
      />

      <Dialog open={newColOpen} onOpenChange={setNewColOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Coluna</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Coluna</Label>
              <Input value={newColLabel} onChange={(e) => setNewColLabel(e.target.value)} placeholder="Ex: Em Negociação" />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <Select value={newColColor} onValueChange={setNewColColor}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(colorMap).map((c) => (
                    <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleCreateStatus} disabled={savingCol || !newColLabel.trim()}>
              {savingCol ? "Criando..." : "Criar Coluna"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
