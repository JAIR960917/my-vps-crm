import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { syncOfflineQueue, getOfflineQueue } from "@/lib/offlineSync";
import { useNavigate } from "react-router-dom";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Filter, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import LeadCard from "@/components/leads/LeadCard";
import LeadFormDialog from "@/components/leads/LeadFormDialog";
import ScheduleLeadDialog from "@/components/leads/ScheduleLeadDialog";
import LeadHistoryDialog from "@/components/leads/LeadHistoryDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

type CrmColumn = {
  id: string; name: string; field_key: string; field_type: string;
  options: any; position: number; is_required: boolean;
};
type Lead = {
  id: string; data: Record<string, any>; assigned_to: string | null;
  created_by: string; status: string; created_at: string;
  scheduled_date?: string | null; comprou?: boolean;
};
type Profile = { user_id: string; full_name: string; email?: string; avatar_url?: string | null; company_id?: string | null };
type CrmStatus = {
  id: string; key: string; label: string; position: number; color: string;
};
type Company = { id: string; name: string };
type FormFieldInfo = { id: string; label: string; is_name_field: boolean; is_phone_field: boolean; show_on_card?: boolean; status_mapping?: Record<string, string> | null; date_status_ranges?: { ranges: { max_years: number; status_key: string }[]; above_all: string; no_answer: string } | null };
type LeadActivity = { id: string; lead_id: string; title: string; scheduled_date: string; completed_at: string | null };

const colorMap: Record<string, { header: string; badge: string }> = {
  blue:    { header: "bg-blue-500",    badge: "bg-blue-500/15 text-blue-700 border-blue-300" },
  amber:   { header: "bg-amber-500",   badge: "bg-amber-500/15 text-amber-700 border-amber-300" },
  violet:  { header: "bg-violet-500",  badge: "bg-violet-500/15 text-violet-700 border-violet-300" },
  cyan:    { header: "bg-cyan-500",    badge: "bg-cyan-500/15 text-cyan-700 border-cyan-300" },
  emerald: { header: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-700 border-emerald-300" },
  red:     { header: "bg-red-500",     badge: "bg-red-500/15 text-red-700 border-red-300" },
};

export default function LeadsPage() {
  const { user, isAdmin, isGerente } = useAuth();
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

  // Filters (admin/gerente only)
  const [filterVendedor, setFilterVendedor] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>();
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>();
  const [showFilters, setShowFilters] = useState(false);
  const [fullProfiles, setFullProfiles] = useState<Profile[]>([]);

  // Schedule dialog
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedulingLead, setSchedulingLead] = useState<Lead | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [appointedLeadIds, setAppointedLeadIds] = useState<Set<string>>(new Set());
  const [leadActivities, setLeadActivities] = useState<LeadActivity[]>([]);

  const LEADS_PER_PAGE = 20;
  const [columnCounts, setColumnCounts] = useState<Record<string, number>>({});
  const [columnOffsets, setColumnOffsets] = useState<Record<string, number>>({});
  const [loadingColumns, setLoadingColumns] = useState<Record<string, boolean>>({});
  const isLoadingColumnRef = useRef<Record<string, boolean>>({});
  const hasScheduledColumn = useMemo(() => statuses.some((status) => status.key === "agendados"), [statuses]);

  const loadFromCache = useCallback(() => {
    try {
      setColumns(JSON.parse(localStorage.getItem("crm_cache_columns") || "[]"));
      setProfiles(JSON.parse(localStorage.getItem("crm_cache_profiles") || "[]"));
      setStatuses(JSON.parse(localStorage.getItem("crm_cache_statuses_full") || "[]"));
      setCompanies(JSON.parse(localStorage.getItem("crm_cache_companies") || "[]"));
      setFormFields(JSON.parse(localStorage.getItem("crm_cache_formfields") || "[]"));
      setCurrentUserName(localStorage.getItem("crm_cache_username") || "");
    } catch {}
  }, []);

  const buildLeadQuery = useCallback((statusKey: string) => {
    let query = supabase
      .from("crm_leads")
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false });

    if (statusKey === "agendados" && hasScheduledColumn) {
      query = query.not("scheduled_date", "is", null);
    } else {
      query = query.eq("status", statusKey);
      if (hasScheduledColumn) {
        query = query.is("scheduled_date", null);
      }
    }

    if ((isAdmin || isGerente) && filterVendedor !== "all") {
      query = query.or(`assigned_to.eq.${filterVendedor},created_by.eq.${filterVendedor}`);
    }

    if (filterDateFrom) {
      const from = new Date(filterDateFrom);
      from.setHours(0, 0, 0, 0);
      query = query.gte("created_at", from.toISOString());
    }

    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59, 999);
      query = query.lte("created_at", to.toISOString());
    }

    return query;
  }, [filterDateFrom, filterDateTo, filterVendedor, hasScheduledColumn, isAdmin, isGerente]);

  const fetchLeadsPage = useCallback(async (statusKey: string, offset = 0, append = false) => {
    if (isLoadingColumnRef.current[statusKey]) return;

    isLoadingColumnRef.current[statusKey] = true;
    setLoadingColumns((prev) => ({ ...prev, [statusKey]: true }));

    const { data, error, count } = await buildLeadQuery(statusKey).range(offset, offset + LEADS_PER_PAGE - 1);

    isLoadingColumnRef.current[statusKey] = false;
    setLoadingColumns((prev) => ({ ...prev, [statusKey]: false }));

    if (error) {
      toast.error(`Erro ao carregar leads da coluna ${statusKey}`);
      return;
    }

    const incoming = ((data || []) as Lead[]).filter((lead) => !appointedLeadIds.has(lead.id));

    setColumnCounts((prev) => ({ ...prev, [statusKey]: count || 0 }));
    setColumnOffsets((prev) => ({ ...prev, [statusKey]: offset + (data?.length || 0) }));

    setLeads((prev) => {
      const remaining = prev.filter((lead) => {
        if (statusKey === "agendados" && hasScheduledColumn) return !lead.scheduled_date;
        if (hasScheduledColumn && lead.scheduled_date) return true;
        return lead.status !== statusKey;
      });

      const base = append ? prev : remaining;
      const seen = new Set(base.map((lead) => lead.id));
      const mergedIncoming = incoming.filter((lead) => !seen.has(lead.id));
      return [...base, ...mergedIncoming];
    });
  }, [appointedLeadIds, buildLeadQuery, hasScheduledColumn]);

  const fetchAll = async () => {
    loadFromCache();
    if (!navigator.onLine) return;

    try {
      const [{ data: cols }, { data: profs }, { data: sts }, { data: comps }, { data: ff }, { data: ffFull }, { data: fullProfs }, { data: activeAppts }, { data: actData }] = await Promise.all([
        supabase.from("crm_columns").select("*").order("position"),
        supabase.rpc("get_profile_names"),
        supabase.from("crm_statuses").select("*").order("position"),
        supabase.from("companies").select("id, name").order("name"),
        supabase.from("crm_form_fields").select("id, label, is_name_field, is_phone_field, show_on_card, status_mapping, date_status_ranges").order("position"),
        supabase.from("crm_form_fields").select("*").order("position"),
        supabase.from("profiles").select("user_id, full_name, avatar_url, company_id"),
        supabase.from("crm_appointments").select("lead_id").eq("status", "agendado"),
        supabase.from("lead_activities").select("id, lead_id, title, scheduled_date, completed_at"),
      ]);

      setColumns(cols || []);
      const companyMap = new Map((fullProfs || []).map((p: any) => [p.user_id, p.company_id]));
      const enrichedProfiles = (profs || []).map((p: any) => ({ ...p, company_id: companyMap.get(p.user_id) || null }));
      setProfiles(enrichedProfiles);
      setStatuses((sts || []) as CrmStatus[]);
      setCompanies((comps || []) as Company[]);
      setFormFields((ff || []) as unknown as FormFieldInfo[]);
      setFullProfiles((fullProfs || []) as Profile[]);
      setAppointedLeadIds(new Set((activeAppts || []).map((a: any) => a.lead_id)));
      setLeadActivities((actData || []) as LeadActivity[]);

      const me = (profs || []).find((p: Profile) => p.user_id === user?.id);
      setCurrentUserName(me?.full_name || user?.email || "");

      try {
        localStorage.setItem("crm_cache_columns", JSON.stringify(cols || []));
        localStorage.setItem("crm_cache_profiles", JSON.stringify(profs || []));
        localStorage.setItem("crm_cache_statuses_full", JSON.stringify(sts || []));
        localStorage.setItem("crm_cache_companies", JSON.stringify(comps || []));
        localStorage.setItem("crm_cache_formfields", JSON.stringify(ff || []));
        localStorage.setItem("crm_cache_fields", JSON.stringify(ffFull || []));
        localStorage.setItem("crm_cache_statuses", JSON.stringify(sts || []));
        localStorage.setItem("crm_cache_username", me?.full_name || user?.email || "");
      } catch {}
    } catch {}
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
      // Recalculate status based on date/mapping fields if they exist
      const hasMappingField = formFields.some(f => (f.status_mapping && Object.keys(f.status_mapping).length > 0) || f.date_status_ranges);
      const finalStatus = hasMappingField ? resolveStatus(formData) : formStatus;
      const { error } = await supabase.from("crm_leads").update({
        data: formData, status: finalStatus, assigned_to: formAssigned || null,
      }).eq("id", editingLead.id);
      if (error) toast.error("Erro ao atualizar");
      else toast.success("Lead atualizado");
    } else {
      const resolvedStatus = resolveStatus(formData);

      // Extract name and phone from form data for duplicate check
      const nameFieldIds = formFields.filter(f => f.is_name_field).map(f => f.id);
      const phoneFieldIds = formFields.filter(f => f.is_phone_field).map(f => f.id);
      const leadName = nameFieldIds.reduce<string | null>((found, id) => found || formData[`field_${id}`] || null, null) || formData.nome_lead || "";
      const leadPhone = phoneFieldIds.reduce<string | null>((found, id) => found || formData[`field_${id}`] || null, null) || formData.telefone || "";

      let existingLead: Lead | null = null;
      if (leadName && leadPhone) {
        // Search for existing lead with same name+phone using already loaded leads
        const allLeads = leads;
        if (allLeads) {
          existingLead = (allLeads as Lead[]).find(l => {
            const d = typeof l.data === "object" ? (l.data as Record<string, any>) : {};
            const eName = nameFieldIds.reduce<string | null>((f, id) => f || d[`field_${id}`] || null, null) || d.nome_lead || "";
            const ePhone = phoneFieldIds.reduce<string | null>((f, id) => f || d[`field_${id}`] || null, null) || d.telefone || "";
            return String(eName).trim().toLowerCase() === String(leadName).trim().toLowerCase()
              && String(ePhone).replace(/\D/g, "") === String(leadPhone).replace(/\D/g, "");
          }) || null;
        }
      }

      if (existingLead) {
        const { error } = await supabase.from("crm_leads").update({
          data: formData, status: resolvedStatus, assigned_to: formAssigned || null,
        }).eq("id", existingLead.id);
        if (error) toast.error("Erro ao atualizar lead existente");
        else toast.success("Lead já existia — informações atualizadas!");
      } else {
        const { error } = await supabase.from("crm_leads").insert({
          data: formData, status: resolvedStatus,
          assigned_to: formAssigned || null, created_by: user!.id,
        });
        if (error) toast.error("Erro ao criar lead");
        else toast.success("Lead criado");
      }
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

  const getLeadDisplayStatus = useCallback((lead: Lead) => {
    const hasScheduledColumn = statuses.some((status) => status.key === "agendados");
    if (lead.scheduled_date && hasScheduledColumn) return "agendados";
    return lead.status;
  }, [statuses]);

  const openScheduleDialog = (lead: Lead) => {
    setSchedulingLead(lead);
    setScheduleOpen(true);
  };

  const getLeadSnapshot = useCallback((lead: Lead | null) => {
    if (!lead) return { nome: "", telefone: "", idade: "" };

    const data = typeof lead.data === "object" ? (lead.data as Record<string, any>) : {};
    const nameFields = formFields.filter((f) => f.is_name_field);
    const phoneFields = formFields.filter((f) => f.is_phone_field);
    const ageFields = formFields.filter((f) => f.label?.toLowerCase().includes("idade"));

    const nome =
      nameFields.reduce<string | null>((found, f) => found || data[`field_${f.id}`] || null, null) ||
      data.nome_lead ||
      columns.reduce<string | null>((found, c) => found || data[c.field_key] || null, null) ||
      "Lead";

    const telefone =
      phoneFields.reduce<string | null>((found, f) => found || data[`field_${f.id}`] || null, null) ||
      data.telefone ||
      columns.find((c) => /telefone|celular|whatsapp|fone/i.test(`${c.name} ${c.field_key}`))?.field_key &&
        data[columns.find((c) => /telefone|celular|whatsapp|fone/i.test(`${c.name} ${c.field_key}`))!.field_key] ||
      "";

    const idade =
      ageFields.reduce<string | null>((found, f) => found || data[`field_${f.id}`] || null, null) ||
      data.idade ||
      columns.find((c) => /idade/i.test(`${c.name} ${c.field_key}`))?.field_key &&
        data[columns.find((c) => /idade/i.test(`${c.name} ${c.field_key}`))!.field_key] ||
      "";

    return { nome: String(nome || ""), telefone: String(telefone || ""), idade: String(idade || "") };
  }, [columns, formFields]);

  const handleScheduleSubmit = async (schedData: { scheduled_datetime: string; valor: number; forma_pagamento: string; canal_agendamento: string }) => {
    if (!schedulingLead || !user) return;
    setScheduleSaving(true);
    const { nome, telefone, idade } = getLeadSnapshot(schedulingLead);
    const { error } = await supabase.from("crm_appointments").insert({
      lead_id: schedulingLead.id,
      scheduled_by: user.id,
      scheduled_datetime: schedData.scheduled_datetime,
      valor: schedData.valor,
      forma_pagamento: schedData.forma_pagamento,
      canal_agendamento: schedData.canal_agendamento,
      previous_status: schedulingLead.status,
      nome,
      telefone,
      idade,
    } as any);
    if (error) toast.error("Erro ao agendar");
    else toast.success("Lead agendado com sucesso!");
    setScheduleSaving(false);
    setScheduleOpen(false);
    setSchedulingLead(null);
    fetchAll();
  };

  const handleToggleComprou = async (leadId: string, value: boolean) => {
    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, comprou: value } : l));
    const { error } = await supabase.from("crm_leads").update({ comprou: value } as any).eq("id", leadId);
    if (error) { toast.error("Erro ao atualizar"); fetchAll(); }
    else toast.success(value ? "Marcado como cliente ativo" : "Marcação removida");
  };


  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId;
    const oldStatus = result.source.droppableId;
    const leadId = result.draggableId;
    if (newStatus === oldStatus) return;

    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, status: newStatus, scheduled_date: null } : l));
    const { error } = await supabase.from("crm_leads").update({ status: newStatus, scheduled_date: null }).eq("id", leadId);
    if (error) {
      toast.error("Erro ao mover lead");
      fetchAll();
    }
  };


  // Vendedor options for the filter (gerente sees only same company, admin sees all)
  const vendedorOptions = useMemo(() => {
    if (!isAdmin && !isGerente) return [];
    if (isAdmin) return fullProfiles;
    // Gerente: find my company_id
    const myProfile = fullProfiles.find(p => p.user_id === user?.id);
    if (!myProfile?.company_id) return [];
    return fullProfiles.filter(p => p.company_id === myProfile.company_id);
  }, [fullProfiles, isAdmin, isGerente, user?.id]);

  const filteredLeads = useMemo(() => leads.filter((l) => !appointedLeadIds.has(l.id)), [leads, appointedLeadIds]);
  
  useEffect(() => {
    if (!statuses.length) return;
    setColumnOffsets({});
    setColumnCounts({});
    setLeads((prev) => prev.filter((lead) => offlineIds.has(lead.id)));
    Promise.all(statuses.map((status) => fetchLeadsPage(status.key, 0, false)));
  }, [statuses, filterVendedor, filterDateFrom, filterDateTo, appointedLeadIds, offlineIds, fetchLeadsPage]);

  const getLeadsByStatus = (status: string) => filteredLeads.filter((lead) => getLeadDisplayStatus(lead) === status);

  const handleColumnScroll = (statusKey: string, e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const offset = columnOffsets[statusKey] || 0;
    const total = columnCounts[statusKey] || 0;
    if (el.scrollTop + el.clientHeight < el.scrollHeight - 100) return;
    if (offset >= total || loadingColumns[statusKey]) return;
    fetchLeadsPage(statusKey, offset, true);
  };

  const getActivitiesForLead = (leadId: string) => leadActivities.filter(a => a.lead_id === leadId);
  const totalAvailableLeads = Object.values(columnCounts).reduce((sum, count) => sum + count, 0);

  const hasActiveFilters = filterVendedor !== "all" || filterDateFrom || filterDateTo;
  const clearFilters = () => { setFilterVendedor("all"); setFilterDateFrom(undefined); setFilterDateTo(undefined); };

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
            {totalAvailableLeads} lead{totalAvailableLeads !== 1 ? "s" : ""}
            {hasActiveFilters && ` (com filtros aplicados)`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(isAdmin || isGerente) && (
            <Button
              size="sm"
              variant={showFilters ? "default" : "outline"}
              onClick={() => setShowFilters(!showFilters)}
              className="shrink-0"
            >
              <Filter className="mr-1 h-4 w-4" />
              Filtros
              {hasActiveFilters && <span className="ml-1 h-2 w-2 rounded-full bg-destructive" />}
            </Button>
          )}
          <Button size="sm" className="shrink-0" onClick={() => navigate("/novo-lead")}>
            <Plus className="mr-1 h-4 w-4" />Lead
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      {(isAdmin || isGerente) && showFilters && (
        <div className="mb-4 p-3 bg-muted/50 rounded-lg border flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px] max-w-[250px]">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Vendedor</label>
            <Select value={filterVendedor} onValueChange={setFilterVendedor}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {vendedorOptions.map(p => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.full_name || "Sem nome"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[140px]">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Data início</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-9 w-full justify-start text-left font-normal", !filterDateFrom && "text-muted-foreground")}>
                  {filterDateFrom ? format(filterDateFrom, "dd/MM/yyyy") : "Selecionar"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={filterDateFrom} onSelect={setFilterDateFrom} locale={ptBR} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div className="min-w-[140px]">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Data fim</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-9 w-full justify-start text-left font-normal", !filterDateTo && "text-muted-foreground")}>
                  {filterDateTo ? format(filterDateTo, "dd/MM/yyyy") : "Selecionar"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={filterDateTo} onSelect={setFilterDateTo} locale={ptBR} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          {hasActiveFilters && (
            <Button size="sm" variant="ghost" onClick={clearFilters} className="h-9">
              <X className="mr-1 h-4 w-4" />Limpar
            </Button>
          )}
        </div>
      )}

      {/* Mobile: Tab selector */}
      <div className="lg:hidden mb-3 overflow-x-auto -mx-3 px-3 sm:-mx-4 sm:px-4">
        <div className="flex gap-1.5 min-w-max">
          {statuses.map((status) => {
            const colors = colorMap[status.color] || colorMap.blue;
            const count = columnCounts[status.key] || 0;
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
      <div className="lg:hidden space-y-2 mb-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 220px)" }} onScroll={(e) => handleColumnScroll(mobileTab, e)}>
        {statuses.filter(s => s.key === mobileTab).map((status) => {
          const statusLeads = getLeadsByStatus(status.key);
          const total = columnCounts[status.key] || 0;
          const hasMore = statusLeads.length < total;
          return (
            <div key={status.key}>
              {statusLeads.length === 0 && !loadingColumns[status.key] && (
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
                    activities={getActivitiesForLead(lead.id)}
                    onEdit={() => openEdit(lead)}
                    onDelete={() => handleDelete(lead.id)}
                    onHistory={() => {
                      setHistoryLeadId(lead.id);
                      setHistoryLeadName(getLeadSnapshot(lead).nome || "Lead");
                      setHistoryOpen(true);
                    }}
                    onSchedule={() => openScheduleDialog(lead)}
                    onToggleComprou={(value) => handleToggleComprou(lead.id, value)}
                  />
                </div>
              ))}
              {loadingColumns[status.key] && (
                <p className="text-center text-xs text-muted-foreground py-2">Carregando...</p>
              )}
              {hasMore && !loadingColumns[status.key] && (
                <p className="text-center text-xs text-muted-foreground py-2">
                  Mostrando {statusLeads.length} de {total} — role para carregar mais
                </p>
              )}
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
        <div className="hidden lg:flex gap-3 overflow-x-auto pb-4" style={{ height: "calc(100vh - 200px)" }}>
          {statuses.map((status) => {
            const statusLeads = getLeadsByStatus(status.key);
            const total = columnCounts[status.key] || 0;
            const hasMore = statusLeads.length < total;
            const colors = colorMap[status.color] || colorMap.blue;
            return (
              <div key={status.key} className="flex-shrink-0 w-[280px] flex flex-col min-h-0">
                <div className="flex items-center gap-2 mb-2 px-1 flex-shrink-0">
                  <div className={`h-2.5 w-2.5 rounded-full ${colors.header}`} />
                  <h3 className="font-semibold text-sm text-foreground">{status.label}</h3>
                  <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
                    {total}
                  </span>
                </div>

                <Droppable droppableId={status.key}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      onScroll={(e) => handleColumnScroll(status.key, e)}
                      className={`flex-1 rounded-xl p-2 space-y-2 transition-colors overflow-y-auto min-h-0 ${
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
                                activities={getActivitiesForLead(lead.id)}
                                onEdit={() => openEdit(lead)}
                                onDelete={() => handleDelete(lead.id)}
                                onHistory={() => {
                                  setHistoryLeadId(lead.id);
                                  setHistoryLeadName(getLeadSnapshot(lead).nome || "Lead");
                                  setHistoryOpen(true);
                                }}
                                onSchedule={() => openScheduleDialog(lead)}
                                onToggleComprou={(value) => handleToggleComprou(lead.id, value)}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}

                      {loadingColumns[status.key] && (
                        <p className="text-center text-xs text-muted-foreground py-1">Carregando...</p>
                      )}

                      {hasMore && !loadingColumns[status.key] && (
                        <p className="text-center text-xs text-muted-foreground py-1">
                          Mostrando {statusLeads.length} de {total} — role para carregar mais
                        </p>
                      )}

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
        canReassign={isAdmin || isGerente}
        onSubmit={handleSave}
        statusOptions={statusOptions}
        statusLabels={statusLabels}
        leadId={editingLead?.id}
        onActivityChange={fetchAll}
      />

      <ScheduleLeadDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        leadName={getLeadSnapshot(schedulingLead).nome}
        leadPhone={getLeadSnapshot(schedulingLead).telefone}
        saving={scheduleSaving}
        onSubmit={handleScheduleSubmit}
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
