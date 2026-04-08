import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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

const STATUS_OPTIONS = ["novo", "em_contato", "qualificado", "proposta", "fechado", "perdido"];
const statusLabels: Record<string, string> = {
  novo: "Novo", em_contato: "Em Contato", qualificado: "Qualificado",
  proposta: "Proposta", fechado: "Fechado", perdido: "Perdido",
};
const statusColors: Record<string, string> = {
  novo: "bg-blue-500/15 text-blue-700 border-blue-300",
  em_contato: "bg-amber-500/15 text-amber-700 border-amber-300",
  qualificado: "bg-violet-500/15 text-violet-700 border-violet-300",
  proposta: "bg-cyan-500/15 text-cyan-700 border-cyan-300",
  fechado: "bg-emerald-500/15 text-emerald-700 border-emerald-300",
  perdido: "bg-red-500/15 text-red-700 border-red-300",
};
const columnHeaderColors: Record<string, string> = {
  novo: "bg-blue-500", em_contato: "bg-amber-500", qualificado: "bg-violet-500",
  proposta: "bg-cyan-500", fechado: "bg-emerald-500", perdido: "bg-red-500",
};

export default function LeadsPage() {
  const { user, isAdmin } = useAuth();
  const [columns, setColumns] = useState<CrmColumn[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [open, setOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [formStatus, setFormStatus] = useState("novo");
  const [formAssigned, setFormAssigned] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLeadId, setHistoryLeadId] = useState<string | null>(null);
  const [historyLeadName, setHistoryLeadName] = useState("");

  const fetchAll = async () => {
    const [{ data: cols }, { data: lds }, { data: profs }] = await Promise.all([
      supabase.from("crm_columns").select("*").order("position"),
      supabase.from("crm_leads").select("*").order("updated_at", { ascending: true }),
      supabase.rpc("get_profile_names"),
    ]);
    setColumns(cols || []);
    setLeads((lds || []) as Lead[]);
    setProfiles(profs || []);
  };

  useEffect(() => { fetchAll(); }, []);

  const openCreate = (status?: string) => {
    setEditingLead(null);
    setFormData({});
    setFormStatus(status || "novo");
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

  const getLeadsByStatus = (status: string) => leads.filter((l) => l.status === status);

  return (
    <AppLayout>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground">
            {leads.length} lead{leads.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => openCreate()}>
          <Plus className="mr-2 h-4 w-4" />Novo Lead
        </Button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 180px)" }}>
          {STATUS_OPTIONS.map((status) => {
            const statusLeads = getLeadsByStatus(status);
            return (
              <div key={status} className="flex-shrink-0 w-[280px] flex flex-col">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className={`h-2.5 w-2.5 rounded-full ${columnHeaderColors[status]}`} />
                  <h3 className="font-semibold text-sm text-foreground">{statusLabels[status]}</h3>
                  <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[status]}`}>
                    {statusLeads.length}
                  </span>
                </div>

                <Droppable droppableId={status}>
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
                                  const primaryCol = columns[0];
                                  setHistoryLeadId(lead.id);
                                  setHistoryLeadName(primaryCol ? (data[primaryCol.field_key] || "Lead") : "Lead");
                                  setHistoryOpen(true);
                                }}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}

                      <button
                        onClick={() => openCreate(status)}
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
        columns={columns}
        profiles={profiles}
        formData={formData}
        setFormData={setFormData}
        formStatus={formStatus}
        setFormStatus={setFormStatus}
        formAssigned={formAssigned}
        setFormAssigned={setFormAssigned}
        saving={saving}
        isEditing={!!editingLead}
        onSubmit={handleSave}
        statusOptions={STATUS_OPTIONS}
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
    </AppLayout>
  );
}
