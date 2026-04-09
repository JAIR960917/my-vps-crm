import { useEffect, useState, useCallback } from "react";
import { syncOfflineQueue, getOfflineQueue } from "@/lib/offlineSync";
import { useNavigate } from "react-router-dom";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type CrmColumn = {
  id: string; name: string; field_key: string; field_type: string;
  options: any; position: number; is_required: boolean;
};
type Lead = {
  id: string; data: Record<string, any>; assigned_to: string | null;
  created_by: string; status: string; created_at: string;
  scheduled_date?: string | null; comprou?: boolean;
};
type Profile = { user_id: string; full_name: string; email?: string; avatar_url?: string | null };
type CrmStatus = {
  id: string; key: string; label: string; position: number; color: string;
};
type Company = { id: string; name: string };
type FormFieldInfo = { id: string; label: string; is_name_field: boolean; is_phone_field: boolean; status_mapping?: Record<string, string> | null; date_status_ranges?: { ranges: { max_years: number; status_key: string }[]; above_all: string; no_answer: string } | null };

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
  const navigate = useNavigate();
  const [columns, setColumns] = useState<CrmColumn[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [statuses, setStatuses] = useState<CrmStatus[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [formFields, setFormFields] = useState<FormFieldInfo[]>([]);
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  // Mobile: active tab for status columns
  const [mobileTab, setMobileTab] = useState<string>("");

  // Offline sync tracking
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());
  const [recentlySyncedIds, setRecentlySyncedIds] = useState<Set<string>>(new Set());

  const loadFromCache = useCallback(() => {
    try {
      setColumns(JSON.parse(localStorage.getItem("crm_cache_columns") || "[]"));
      setLeads(JSON.parse(localStorage.getItem("crm_cache_leads") || "[]"));
      setProfiles(JSON.parse(localStorage.getItem("crm_cache_profiles") || "[]"));
      setStatuses(JSON.parse(localStorage.getItem("crm_cache_statuses_full") || "[]"));
      setCompanies(JSON.parse(localStorage.getItem("crm_cache_companies") || "[]"));
      setFormFields(JSON.parse(localStorage.getItem("crm_cache_formfields") || "[]"));
      setCurrentUserName(localStorage.getItem("crm_cache_username") || "");
    } catch {}
  }, []);

  const fetchAll = async () => {
    // Always load cache first for instant display
    loadFromCache();

    if (!navigator.onLine) return;

    try {
      const [{ data: cols }, { data: lds }, { data: profs }, { data: sts }, { data: comps }, { data: ff }, { data: ffFull }] = await Promise.all([
        supabase.from("crm_columns").select("*").order("position"),
        supabase.from("crm_leads").select("*").order("updated_at", { ascending: true }),
        supabase.rpc("get_profile_names"),
        supabase.from("crm_statuses").select("*").order("position"),
        supabase.from("companies").select("id, name").order("name"),
        supabase.from("crm_form_fields").select("id, label, is_name_field, is_phone_field, show_on_card, status_mapping, date_status_ranges").order("position"),
        supabase.from("crm_form_fields").select("*").order("position"),
      ]);
      setColumns(cols || []);
      const loadedLeads = (lds || []) as Lead[];
      setProfiles(profs || []);
      setStatuses((sts || []) as CrmStatus[]);
      setCompanies((comps || []) as Company[]);
      const loadedFields = (ff || []) as unknown as FormFieldInfo[];
      setFormFields(loadedFields);
      const me = (profs || []).find((p: Profile) => p.user_id === user?.id);
      setCurrentUserName(me?.full_name || user?.email || "");

      // Auto-recalculate lead statuses based on date fields
      const dateFields = loadedFields.filter(f => f.date_status_ranges);
      if (dateFields.length > 0) {
        const updates: PromiseLike<any>[] = [];
        const updatedLeads = loadedLeads.map(lead => {
          const leadData = (typeof lead.data === "object" && lead.data !== null) ? lead.data as Record<string, any> : {};
          for (const df of dateFields) {
            const config = df.date_status_ranges!;
            const fieldKey = `field_${df.id}`;
            const dateVal = leadData[fieldKey];
            let newStatus: string | null = null;
            if (!dateVal || (typeof dateVal === "string" && !dateVal.trim())) {
              if (config.no_answer) newStatus = config.no_answer;
            } else {
              const diffMs = Date.now() - new Date(dateVal).getTime();
              const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);
              const sortedRanges = [...config.ranges].sort((a, b) => a.max_years - b.max_years);
              let matched = false;
              for (const range of sortedRanges) {
                if (diffYears <= range.max_years && range.status_key) {
                  newStatus = range.status_key;
                  matched = true;
                  break;
                }
              }
              if (!matched && config.above_all) newStatus = config.above_all;
            }
            if (newStatus && newStatus !== lead.status) {
              updates.push(supabase.from("crm_leads").update({ status: newStatus }).eq("id", lead.id));
              return { ...lead, status: newStatus };
            }
          }
          return lead;
        });
        if (updates.length > 0) {
          await Promise.all(updates);
        }
        setLeads(updatedLeads);
      } else {
        setLeads(loadedLeads);
      }

      // Cache for offline
      try {
        localStorage.setItem("crm_cache_columns", JSON.stringify(cols || []));
        localStorage.setItem("crm_cache_leads", JSON.stringify(lds || []));
        localStorage.setItem("crm_cache_profiles", JSON.stringify(profs || []));
        localStorage.setItem("crm_cache_statuses_full", JSON.stringify(sts || []));
        localStorage.setItem("crm_cache_companies", JSON.stringify(comps || []));
        localStorage.setItem("crm_cache_formfields", JSON.stringify(ff || []));
        localStorage.setItem("crm_cache_fields", JSON.stringify(ffFull || []));
        localStorage.setItem("crm_cache_statuses", JSON.stringify(sts || []));
        const me2 = (profs || []).find((p: Profile) => p.user_id === user?.id);
        localStorage.setItem("crm_cache_username", me2?.full_name || user?.email || "");
      } catch {}
    } catch {
      // Network failed, cache already loaded
    }
  };

  const trySyncOffline = useCallback(async () => {
    if (!navigator.onLine) return;
    const queue = getOfflineQueue();
    if (queue.length === 0) return;
    const syncedIds = await syncOfflineQueue();
    if (syncedIds.length > 0) {
      setRecentlySyncedIds(new Set(syncedIds));
      toast.success(`${syncedIds.length} lead(s) sincronizado(s)!`);
      setTimeout(() => setRecentlySyncedIds(new Set()), 5000);
    }
    // Update offline ids with remaining queue
    const remaining = getOfflineQueue();
    setOfflineIds(new Set(remaining.map(l => l.id)));
    await fetchAll();
  }, []);

  // Merge offline leads into the leads list
  const mergeOfflineLeads = useCallback(() => {
    const queue = getOfflineQueue();
    const queueIds = new Set(queue.map(l => l.id));
    setOfflineIds(queueIds);
    if (queue.length > 0) {
      setLeads(prev => {
        const existingIds = new Set(prev.map(l => l.id));
        const newOfflineLeads = queue
          .filter(l => !existingIds.has(l.id))
          .map(l => ({
            id: l.id,
            data: l.data,
            assigned_to: l.assigned_to,
            created_by: l.created_by,
            status: l.status,
            created_at: l.created_at,
          }));
        if (newOfflineLeads.length === 0) return prev;
        return [...prev, ...newOfflineLeads];
      });
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await fetchAll();
      mergeOfflineLeads();
      // Try to sync any pending offline leads on page load
      await trySyncOffline();
    };
    init();
  }, []);

  // Sync offline queue when coming back online
  useEffect(() => {
    const handleOnline = async () => {
      await trySyncOffline();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [trySyncOffline]);

  // Periodically try to sync offline queue (every 30s)
  useEffect(() => {
    const interval = setInterval(() => {
      const queue = getOfflineQueue();
      if (queue.length > 0 && navigator.onLine) {
        trySyncOffline();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [trySyncOffline]);

  // Set default mobile tab when statuses load
  useEffect(() => {
    if (statuses.length > 0 && !mobileTab) {
      setMobileTab(statuses[0].key);
    }
  }, [statuses]);

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

  const resolveStatus = (data: Record<string, any>): string => {
    const defaultStatus = statuses.length > 0 ? statuses[0].key : formStatus;

    // Check date-based mapping first
    const dateFields = formFields.filter(f => f.date_status_ranges);
    for (const df of dateFields) {
      const fieldKey = `field_${df.id}`;
      const dateVal = data[fieldKey];
      const config = df.date_status_ranges!;
      if (!dateVal || (typeof dateVal === "string" && !dateVal.trim())) {
        if (config.no_answer) return config.no_answer;
        continue;
      }
      const diffMs = Date.now() - new Date(dateVal).getTime();
      const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);
      const sortedRanges = [...config.ranges].sort((a, b) => a.max_years - b.max_years);
      for (const range of sortedRanges) {
        if (diffYears <= range.max_years && range.status_key) return range.status_key;
      }
      if (config.above_all) return config.above_all;
    }

    // Then check option-based mapping
    const mappingFields = formFields.filter(f => f.status_mapping && Object.keys(f.status_mapping).length > 0);
    if (mappingFields.length === 0 && dateFields.length === 0) return formStatus;
    for (const mf of [...mappingFields].reverse()) {
      const fieldKey = `field_${mf.id}`;
      const answer = data[fieldKey];
      if (!answer || (typeof answer === "string" && !answer.trim())) continue;
      const mapping = mf.status_mapping!;
      if (typeof answer === "string" && mapping[answer]) return mapping[answer];
      if (Array.isArray(answer)) {
        for (const v of answer) {
          if (mapping[v]) return mapping[v];
        }
      }
    }
    return defaultStatus;
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
      const resolvedStatus = resolveStatus(formData);
      const { error } = await supabase.from("crm_leads").insert({
        data: formData, status: resolvedStatus,
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
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    const { error } = await supabase.from("crm_leads").delete().eq("id", deleteConfirmId);
    if (error) toast.error("Erro ao remover");
    else { toast.success("Lead removido"); fetchAll(); }
    setDeleteConfirmId(null);
  };

  const handleSchedule = async (leadId: string, date: Date | null) => {
    if (date) {
      // Set scheduled date and move to "agendados" status
      setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, scheduled_date: date.toISOString(), status: "agendados" } : l));
      const { error } = await supabase.from("crm_leads").update({
        scheduled_date: date.toISOString(),
        status: "agendados",
      }).eq("id", leadId);
      if (error) { toast.error("Erro ao agendar"); fetchAll(); }
      else toast.success("Lead agendado");
    } else {
      // Remove scheduling - recalculate status based on lead data (date fields, mappings)
      const lead = leads.find((l) => l.id === leadId);
      const leadData = lead ? (typeof lead.data === "object" ? lead.data as Record<string, any> : {}) : {};
      const recalculatedStatus = resolveStatus(leadData);
      setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, scheduled_date: null, status: recalculatedStatus } : l));
      const { error } = await supabase.from("crm_leads").update({
        scheduled_date: null,
        status: recalculatedStatus,
      }).eq("id", leadId);
      if (error) { toast.error("Erro ao remover agendamento"); fetchAll(); }
      else toast.success("Agendamento removido");
    }
  };

  const handleToggleComprou = async (leadId: string, value: boolean) => {
    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, comprou: value } : l));
    const { error } = await supabase.from("crm_leads").update({ comprou: value }).eq("id", leadId);
    if (error) { toast.error("Erro ao atualizar"); fetchAll(); }
    else toast.success(value ? "Marcado como cliente ativo" : "Marcação removida");
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

  const getSyncStatus = (leadId: string): "offline" | "synced" | null => {
    if (offlineIds.has(leadId)) return "offline";
    if (recentlySyncedIds.has(leadId)) return "synced";
    return null;
  };
  return (
    <AppLayout>
      <div className="mb-3 sm:mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold">Leads</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {leads.length} lead{leads.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="shrink-0" onClick={() => navigate("/novo-lead")}>
            <Plus className="mr-1 h-4 w-4" />Lead
          </Button>
        </div>
      </div>

      {/* Mobile: Tab selector */}
      <div className="lg:hidden mb-3 overflow-x-auto -mx-3 px-3 sm:-mx-4 sm:px-4">
        <div className="flex gap-1.5 min-w-max">
          {statuses.map((status) => {
            const colors = colorMap[status.color] || colorMap.blue;
            const count = getLeadsByStatus(status.key).length;
            return (
              <button
                key={status.key}
                onClick={() => setMobileTab(status.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  mobileTab === status.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <div className={`h-2 w-2 rounded-full ${mobileTab === status.key ? "bg-primary-foreground/80" : colors.header}`} />
                {status.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  mobileTab === status.key ? "bg-primary-foreground/20" : "bg-background"
                }`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile: Active column cards */}
      <div className="lg:hidden space-y-2 mb-4">
        {statuses.filter(s => s.key === mobileTab).map((status) => {
          const statusLeads = getLeadsByStatus(status.key);
          return (
            <div key={status.key}>
              {statusLeads.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">Nenhum lead nesta coluna</p>
              )}
              {statusLeads.map((lead) => (
                <div key={lead.id} className="mb-2">
                  <LeadCard
                    lead={lead}
                    columns={columns}
                    formFields={formFields}
                    profiles={profiles}
                    isAdmin={isAdmin}
                    syncStatus={getSyncStatus(lead.id)}
                    onEdit={() => openEdit(lead)}
                    onDelete={() => handleDelete(lead.id)}
                    onHistory={() => {
                      const data = typeof lead.data === "object" ? lead.data as Record<string, any> : {};
                      setHistoryLeadId(lead.id);
                      const nf = formFields.find(f => f.is_name_field);
                      setHistoryLeadName((nf ? data[`field_${nf.id}`] : null) || data.nome_lead || "Lead");
                      setHistoryOpen(true);
                    }}
                    onSchedule={(date) => handleSchedule(lead.id, date)}
                    onToggleComprou={(value) => handleToggleComprou(lead.id, value)}
                  />
                </div>
              ))}
              <button
                onClick={() => navigate(`/novo-lead?status=${status.key}`)}
                className="w-full py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-card rounded-lg border border-dashed border-border/50 hover:border-border transition-colors"
              >
                + Adicionar lead
              </button>
            </div>
          );
        })}
      </div>

      {/* Desktop: Kanban board with drag & drop */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="hidden lg:flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 200px)" }}>
          {statuses.map((status) => {
            const statusLeads = getLeadsByStatus(status.key);
            const colors = colorMap[status.color] || colorMap.blue;
            return (
              <div key={status.key} className="flex-shrink-0 w-[280px] flex flex-col">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className={`h-2.5 w-2.5 rounded-full ${colors.header}`} />
                  <h3 className="font-semibold text-sm text-foreground">{status.label}</h3>
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
                                formFields={formFields}
                                profiles={profiles}
                                isAdmin={isAdmin}
                                syncStatus={getSyncStatus(lead.id)}
                                onEdit={() => openEdit(lead)}
                                onDelete={() => handleDelete(lead.id)}
                                onHistory={() => {
                                  const data = typeof lead.data === "object" ? lead.data as Record<string, any> : {};
                                  setHistoryLeadId(lead.id);
                                  const nf = formFields.find(f => f.is_name_field);
                                  setHistoryLeadName((nf ? data[`field_${nf.id}`] : null) || data.nome_lead || "Lead");
                                  setHistoryOpen(true);
                                }}
                                onSchedule={(date) => handleSchedule(lead.id, date)}
                                onToggleComprou={(value) => handleToggleComprou(lead.id, value)}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}

                      <button
                        onClick={() => navigate(`/novo-lead?status=${status.key}`)}
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

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lead permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O lead e todas as suas informações serão removidos permanentemente do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </AppLayout>
  );
}
