import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, Phone, User, UserCheck, CalendarHeart, AlertTriangle, CalendarClock, Clock, CheckCircle2, Shuffle, Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatPhoneBR } from "@/lib/phoneFormat";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import RenovacaoEditSheet from "@/components/renovacoes/RenovacaoEditSheet";

type Renovacao = {
  id: string;
  data: Record<string, any>;
  status: string;
  assigned_to: string | null;
  created_by: string | null;
  valor: number;
  data_ultima_compra: string | null;
  created_at: string;
  updated_at: string;
};

type AppRole = "admin" | "vendedor" | "gerente" | "financeiro";
type CrmStatus = { id: string; key: string; label: string; position: number; color: string };
type Profile = { user_id: string; full_name: string; avatar_url?: string | null };
type Company = { id: string; name: string };
type UserRole = { user_id: string; role: AppRole };
type RenovacaoActivity = { id: string; renovacao_id: string; title: string; scheduled_date: string; completed_at: string | null };

type FormField = {
  id: string;
  label: string;
  field_type: string;
  options: string[] | null;
  position: number;
  is_required: boolean;
  is_name_field: boolean;
  is_phone_field: boolean;
  is_last_visit_field: boolean;
  is_cpf_field?: boolean;
  show_on_card: boolean;
  parent_field_id: string | null;
  parent_trigger_value: string | null;
};

const colorMap: Record<string, { header: string; badge: string }> = {
  blue:    { header: "bg-blue-500",    badge: "bg-blue-500/15 text-blue-700 border-blue-300" },
  amber:   { header: "bg-amber-500",   badge: "bg-amber-500/15 text-amber-700 border-amber-300" },
  violet:  { header: "bg-violet-500",  badge: "bg-violet-500/15 text-violet-700 border-violet-300" },
  cyan:    { header: "bg-cyan-500",    badge: "bg-cyan-500/15 text-cyan-700 border-cyan-300" },
  emerald: { header: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-700 border-emerald-300" },
  red:     { header: "bg-red-500",     badge: "bg-red-500/15 text-red-700 border-red-300" },
};

const parseStoredDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  const raw = String(value).trim();
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const p = new Date(`${raw}T12:00:00`);
    return Number.isNaN(p.getTime()) ? undefined : p;
  }
  const p = new Date(raw);
  return Number.isNaN(p.getTime()) ? undefined : p;
};

const normalizePhoneDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(0, 11);
const DIRECIONAMENTO_STATUS = "fazer_direcionamento_para_o_vendedor";

const statusKeyForRenovacao = (diasDesdeUltimaCompra: number | null): string => {
  if (diasDesdeUltimaCompra === null) return "novo";
  if (diasDesdeUltimaCompra < 365) return "em_contato";
  if (diasDesdeUltimaCompra < 730) return "agendado";
  if (diasDesdeUltimaCompra < 1095) return "renovado";
  return "mais_de_3_anos";
};

const getRenovacaoFlowStatus = (lastPurchaseDate: unknown): string => {
  const parsedDate = parseStoredDate(lastPurchaseDate);
  if (!parsedDate) return "novo";
  const diasDesdeUltimaCompra = Math.floor((Date.now() - parsedDate.getTime()) / 86400000);
  return statusKeyForRenovacao(diasDesdeUltimaCompra);
};

export default function ActiveClientsPage() {
  const { user, isAdmin, isGerente } = useAuth();
  const [renovacoes, setRenovacoes] = useState<Renovacao[]>([]);
  const [statuses, setStatuses] = useState<CrmStatus[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [fields, setFields] = useState<FormField[]>([]);
  const [activities, setActivities] = useState<RenovacaoActivity[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Renovacao | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [formStatus, setFormStatus] = useState("");
  const [formAssigned, setFormAssigned] = useState("");
  const [formValor, setFormValor] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCompanyId, setFilterCompanyId] = useState("all");
  const [filterAssignedTo, setFilterAssignedTo] = useState("all");
  const [mobileTab, setMobileTab] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [autoAssignConfirm, setAutoAssignConfirm] = useState(false);

  const unassignedCount = useMemo(() => {
    let items = renovacoes.filter(r => !r.assigned_to && (r as any).ssotica_company_id);
    if (filterCompanyId !== "all") items = items.filter(r => (r as any).ssotica_company_id === filterCompanyId);
    return items.length;
  }, [renovacoes, filterCompanyId]);

  const runAutoAssign = async () => {
    setAutoAssigning(true);
    try {
      const body: any = {};
      if (filterCompanyId !== "all") body.company_id = filterCompanyId;
      const { data, error } = await supabase.functions.invoke("auto-assign-renovacoes", { body });
      if (error) throw error;
      const total = (data as any)?.total_assigned ?? 0;
      toast.success(`${total} lead${total !== 1 ? "s" : ""} distribuído${total !== 1 ? "s" : ""} entre os vendedores`);
      await fetchAll();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao distribuir leads");
    } finally {
      setAutoAssigning(false);
      setAutoAssignConfirm(false);
    }
  };

  // Lazy rendering: 20 cards por coluna, "carrega mais" ao rolar
  const ITEMS_PER_PAGE = 20;
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const getVisibleCount = (statusKey: string) => visibleCounts[statusKey] || ITEMS_PER_PAGE;
  const loadMore = (statusKey: string) =>
    setVisibleCounts(prev => ({ ...prev, [statusKey]: (prev[statusKey] || ITEMS_PER_PAGE) + ITEMS_PER_PAGE }));
  const handleColumnScroll = (e: React.UIEvent<HTMLDivElement>, statusKey: string) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) loadMore(statusKey);
  };

  const fetchAllRenovacoes = async () => {
    const PAGE_SIZE = 1000;
    let all: any[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("crm_renovacoes")
        .select("*")
        .order("updated_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error || !data) break;
      all = all.concat(data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return all;
  };

  const fetchAll = useCallback(async () => {
    const [items, { data: sts }, { data: profs }, { data: roles }, { data: comps }, { data: ff }, { data: acts }] = await Promise.all([
      fetchAllRenovacoes(),
      supabase.from("crm_renovacao_statuses").select("*").order("position"),
      supabase.rpc("get_profile_names"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("companies").select("id, name").order("name"),
      supabase.from("crm_renovacao_form_fields").select("*").order("position"),
      supabase.from("renovacao_activities").select("id,renovacao_id,title,scheduled_date,completed_at"),
    ]);
    setRenovacoes((items || []) as Renovacao[]);
    setStatuses((sts || []) as CrmStatus[]);
    setProfiles((profs || []) as Profile[]);
    setUserRoles((roles || []) as UserRole[]);
    setCompanies((comps || []) as Company[]);
    setFields((ff || []) as unknown as FormField[]);
    setActivities((acts || []) as RenovacaoActivity[]);
  }, []);


  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Reseta a paginação quando filtros/busca mudam
  useEffect(() => { setVisibleCounts({}); }, [filterCompanyId, filterAssignedTo, searchQuery]);

  useEffect(() => {
    if (statuses.length > 0 && !mobileTab) setMobileTab(statuses[0].key);
  }, [statuses]);

  const statusOptions = statuses.map(s => s.key);
  const vendedorIds = useMemo(
    () => new Set(userRoles.filter((entry) => entry.role === "vendedor").map((entry) => entry.user_id)),
    [userRoles],
  );
  const nameField = useMemo(() => fields.find(f => f.is_name_field), [fields]);
  const phoneField = useMemo(() => fields.find(f => f.is_phone_field), [fields]);
  const lastVisitField = useMemo(() => fields.find(f => f.is_last_visit_field), [fields]);
  const cpfField = useMemo(
    () => fields.find(f => f.is_cpf_field) || fields.find(f => /cpf/i.test(f.label)),
    [fields],
  );

  const openCreate = (status?: string) => {
    setEditingItem(null);
    setFormData({});
    setFormStatus(status || statusOptions[0] || "novo");
    setFormAssigned("");
    setFormValor("");
    setDialogOpen(true);
  };

  const openEdit = (item: Renovacao) => {
    setEditingItem(item);
    const initial: Record<string, any> = typeof item.data === "object" && item.data ? { ...item.data } : {};
    // Backward-compat: migrar campos fixos (vindos do SSótica ou de cards antigos) para os field_<id>
    if (nameField && !initial[`field_${nameField.id}`] && initial.nome) initial[`field_${nameField.id}`] = initial.nome;
    if (phoneField && !initial[`field_${phoneField.id}`] && initial.telefone) initial[`field_${phoneField.id}`] = initial.telefone;
    if (cpfField && !initial[`field_${cpfField.id}`] && (initial.documento || initial.cpf)) {
      initial[`field_${cpfField.id}`] = initial.documento || initial.cpf;
    }
    // Data da última visita: SEMPRE usa a coluna data_ultima_compra como fonte da verdade
    // (o sync do SSótica grava lá; aqui sobrescreve para refletir a data real da última compra)
    if (lastVisitField && item.data_ultima_compra) {
      initial[`field_${lastVisitField.id}`] = item.data_ultima_compra;
    }
    setFormData(initial);
    setFormStatus(item.status);
    setFormAssigned(item.assigned_to || "");
    setFormValor(String(item.valor || ""));
    setDialogOpen(true);
  };

  const set = (key: string, val: any) => setFormData(p => ({ ...p, [key]: val }));
  const toggleArray = (key: string, item: string) => {
    const arr: string[] = formData[key] || [];
    set(key, arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]);
  };

  const isFieldVisible = (field: FormField): boolean => {
    if (!field.parent_field_id) return true;
    const parent = fields.find(f => f.id === field.parent_field_id);
    if (!parent || !isFieldVisible(parent)) return false;
    if (!field.parent_trigger_value) return true;
    let triggers: string[];
    try {
      const p = JSON.parse(field.parent_trigger_value);
      triggers = Array.isArray(p) ? p : [field.parent_trigger_value];
    } catch { triggers = [field.parent_trigger_value]; }
    const pv = formData[`field_${parent.id}`];
    if (Array.isArray(pv)) return pv.some((v: string) => triggers.includes(v));
    return triggers.includes(pv);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const valor = parseFloat(formValor) || 0;

    // Mirror name/phone/last-visit into fixed columns for backward-compat & filtering
    const dataToSave: Record<string, any> = { ...formData };
    if (nameField) dataToSave.nome = formData[`field_${nameField.id}`] || "";
    if (phoneField) dataToSave.telefone = formData[`field_${phoneField.id}`] || "";
    const lastVisitValue = lastVisitField ? formData[`field_${lastVisitField.id}`] : null;
    const assignedTo = formAssigned || null;
    // Qualquer usuário atribuído (vendedor, gerente, admin, financeiro) é considerado responsável
    const hasAssignedUser = !!assignedTo;
    const flowStatus = getRenovacaoFlowStatus(lastVisitValue || editingItem?.data_ultima_compra || null);

    let resolvedStatus = formStatus;
    if (!hasAssignedUser) {
      resolvedStatus = DIRECIONAMENTO_STATUS;
    } else if (formStatus === DIRECIONAMENTO_STATUS || editingItem?.status === DIRECIONAMENTO_STATUS) {
      resolvedStatus = flowStatus;
    }

    const payload: any = {
      data: dataToSave,
      status: resolvedStatus,
      assigned_to: assignedTo,
      valor,
      data_ultima_compra: lastVisitValue || null,
    };

    if (editingItem) {
      const { error } = await supabase.from("crm_renovacoes").update(payload).eq("id", editingItem.id);
      if (error) toast.error("Erro ao atualizar"); else toast.success("Renovação atualizada");
    } else {
      const { error } = await supabase.from("crm_renovacoes").insert({ ...payload, created_by: user?.id });
      if (error) toast.error("Erro ao criar renovação"); else toast.success("Renovação criada");
    }
    setSaving(false);
    setDialogOpen(false);
    fetchAll();
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    const { error } = await supabase.from("crm_renovacoes").delete().eq("id", deleteConfirmId);
    if (error) toast.error("Erro ao excluir"); else toast.success("Renovação excluída");
    setDeleteConfirmId(null);
    fetchAll();
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId;
    const itemId = result.draggableId;
    const currentItem = renovacoes.find((item) => item.id === itemId);
    if (!currentItem) return;

    const hasAssignedUser = !!currentItem.assigned_to;
    let resolvedStatus = newStatus;

    if (!hasAssignedUser) {
      resolvedStatus = DIRECIONAMENTO_STATUS;
      if (newStatus !== DIRECIONAMENTO_STATUS) {
        toast.info("Cards sem responsável ficam em 'Fazer direcionamento para o vendedor'.");
      }
    } else if (newStatus === DIRECIONAMENTO_STATUS) {
      resolvedStatus = getRenovacaoFlowStatus(currentItem.data_ultima_compra);
    }

    setRenovacoes(prev => prev.map(r => r.id === itemId ? { ...r, status: resolvedStatus } : r));
    await supabase.from("crm_renovacoes").update({ status: resolvedStatus }).eq("id", itemId);
  };

  const getProfileName = (uid: string | null) => uid ? (profiles.find(p => p.user_id === uid)?.full_name || "") : "";

  const filteredItems = useMemo(() => {
    let items = renovacoes;
    if (filterCompanyId !== "all") {
      items = items.filter(r => (r as any).ssotica_company_id === filterCompanyId);
    }
    if (filterAssignedTo !== "all") {
      if (filterAssignedTo === "__unassigned__") {
        items = items.filter(r => !r.assigned_to);
      } else {
        items = items.filter(r => r.assigned_to === filterAssignedTo);
      }
    }
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(r => {
      const d = r.data as Record<string, any>;
      return (d.nome || "").toLowerCase().includes(q)
        || (d.telefone || "").includes(q)
        || String(r.valor).includes(q);
    });
  }, [renovacoes, searchQuery, filterCompanyId, filterAssignedTo]);

  const getByStatus = (key: string) => filteredItems.filter(r => r.status === key);

  const renderCard = (item: Renovacao) => {
    const d = item.data as Record<string, any>;
    const lastVisit = item.data_ultima_compra
      ? parseStoredDate(item.data_ultima_compra)
      : (lastVisitField ? parseStoredDate(d[`field_${lastVisitField.id}`]) : undefined);

    const cardFields = fields.filter(f => f.show_on_card && !f.is_name_field && !f.is_phone_field && !f.is_last_visit_field);

    // Activity status (em dia / hoje / atrasada / pendente)
    const itemActivities = activities.filter(a => a.renovacao_id === item.id);
    const pending = itemActivities.filter(a => !a.completed_at);
    const overdue = pending.filter(a => new Date(a.scheduled_date) < new Date());
    const today = pending.filter(a => {
      const dt = new Date(a.scheduled_date);
      const now = new Date();
      return dt.toDateString() === now.toDateString() && dt >= now;
    });
    const hasOverdue = overdue.length > 0;
    const hasToday = today.length > 0;
    const hasPending = pending.length > 0 && !hasOverdue && !hasToday;

    let cardBorderClass = "";
    if (hasOverdue) {
      cardBorderClass = "border-red-500 bg-red-500/10 shadow-red-500/20 shadow-md";
    } else if (hasToday) {
      cardBorderClass = "border-amber-400 bg-amber-500/5";
    } else if (hasPending) {
      cardBorderClass = "border-blue-400/50 bg-blue-500/5";
    }

    const nextActivity = [...pending].sort(
      (a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
    )[0];

    return (
      <div className={`bg-card border rounded-xl p-3 space-y-2 shadow-sm ${cardBorderClass}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{d.nome || "Sem nome"}</p>
            {d.telefone && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Phone className="h-3 w-3" />{formatPhoneBR(d.telefone)}
              </p>
            )}
          </div>
          {Number(item.valor || 0) > 0 && (
            <Badge variant="outline" className="text-xs shrink-0">
              R$ {Number(item.valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </Badge>
          )}
        </div>

        {lastVisit && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 border border-primary/30">
            <CalendarHeart className="h-3.5 w-3.5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase font-bold text-primary leading-none">Última consulta</p>
              <p className="text-xs font-semibold text-foreground mt-0.5">{format(lastVisit, "dd/MM/yyyy", { locale: ptBR })}</p>
            </div>
          </div>
        )}

        {cardFields.map(f => {
          const v = d[`field_${f.id}`];
          if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) return null;
          const display = Array.isArray(v) ? v.join(", ") : (f.field_type === "date" ? (parseStoredDate(v) ? format(parseStoredDate(v)!, "dd/MM/yyyy", { locale: ptBR }) : String(v)) : String(v));
          return (
            <div key={f.id} className="text-xs">
              <span className="text-muted-foreground">{f.label}: </span>
              <span className="font-medium">{display}</span>
            </div>
          );
        })}

        {item.assigned_to && (() => {
          const ap = profiles.find(p => p.user_id === item.assigned_to);
          if (!ap) return null;
          return (
            <div className="pt-1">
              <p className="text-[11px] text-muted-foreground leading-tight">Pessoa responsável</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Avatar className="h-5 w-5 text-[9px]">
                  <AvatarImage src={ap.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-[9px]">
                    {(ap.full_name || "?").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium text-foreground truncate">{ap.full_name}</span>
              </div>
            </div>
          );
        })()}
        {/* Activity status badges */}
        <div className="pt-2 border-t">
          {hasOverdue && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-red-500 px-2 py-0.5 rounded-full uppercase">
              <AlertTriangle className="h-3 w-3" />
              Atrasada
            </span>
          )}
          {hasToday && !hasOverdue && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full uppercase">
              <CalendarClock className="h-3 w-3" />
              Hoje
            </span>
          )}
          {hasPending && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full uppercase">
              <Clock className="h-3 w-3" />
              Pendente
            </span>
          )}
          {!hasOverdue && !hasToday && !hasPending && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-emerald-500 px-2 py-0.5 rounded-full uppercase">
              <CheckCircle2 className="h-3 w-3" />
              Em dia
            </span>
          )}

          {nextActivity && (
            <div className={`text-xs mt-1.5 ${hasOverdue ? "text-red-600" : hasToday ? "text-amber-600" : "text-muted-foreground"}`}>
              <p className="font-medium truncate">{nextActivity.title}</p>
              <p className="text-[10px]">
                {(() => {
                  try { return format(new Date(nextActivity.scheduled_date), "dd/MM 'às' HH:mm", { locale: ptBR }); }
                  catch { return ""; }
                })()}
              </p>
            </div>
          )}
        </div>

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
        <div className="flex flex-wrap gap-2">
          {(isAdmin || isGerente) && companies.length > 0 && (
            <Select value={filterCompanyId} onValueChange={setFilterCompanyId}>
              <SelectTrigger className="h-9 w-full sm:w-56">
                <SelectValue placeholder="Filtrar por empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {companies.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name.trim()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(isAdmin || isGerente) && profiles.length > 0 && (
            <Select value={filterAssignedTo} onValueChange={setFilterAssignedTo}>
              <SelectTrigger className="h-9 w-full sm:w-56">
                <SelectValue placeholder="Filtrar por responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os responsáveis</SelectItem>
                <SelectItem value="__unassigned__">— Sem responsável —</SelectItem>
                {[...profiles]
                  .filter(p => p.full_name?.trim())
                  .sort((a, b) => a.full_name.localeCompare(b.full_name))
                  .map(p => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
          {(isAdmin || isGerente) && unassignedCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAutoAssignConfirm(true)}
              disabled={autoAssigning}
              className="border-amber-500/50 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
            >
              {autoAssigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shuffle className="mr-2 h-4 w-4" />}
              Distribuir {unassignedCount} sem responsável
            </Button>
          )}
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

      <div className="lg:hidden space-y-2 mb-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
        {statuses.filter(s => s.key === mobileTab).map(status => {
          const items = getByStatus(status.key);
          const visibleItems = items.slice(0, getVisibleCount(status.key));
          const hasMore = items.length > visibleItems.length;
          return (
            <div key={status.key}>
              {items.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Nenhuma renovação nesta coluna</p>}
              {visibleItems.map(r => <div key={r.id} className="mb-2">{renderCard(r)}</div>)}
              {hasMore && (
                <button
                  onClick={() => loadMore(status.key)}
                  className="w-full py-2 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg border border-dashed border-primary/40 transition-colors mb-2"
                >
                  Carregar mais ({items.length - visibleItems.length} restantes)
                </button>
              )}
              <button onClick={() => openCreate(status.key)} className="w-full py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-card rounded-lg border border-dashed border-border/50 hover:border-border transition-colors">
                + Adicionar renovação
              </button>
            </div>
          );
        })}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="hidden lg:flex gap-3 overflow-x-auto pb-4" style={{ height: "calc(100vh - 200px)" }}>
          {statuses.map(status => {
            const items = getByStatus(status.key);
            const visibleItems = items.slice(0, getVisibleCount(status.key));
            const hasMore = items.length > visibleItems.length;
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
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      onScroll={(e) => handleColumnScroll(e, status.key)}
                      className={`flex-1 rounded-xl p-2 space-y-2 transition-colors overflow-y-auto min-h-0 ${
                        snapshot.isDraggingOver ? "bg-primary/5 border-2 border-dashed border-primary/30" : "bg-muted/50 border border-transparent"
                      }`}
                    >
                      {visibleItems.map((r, index) => (
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
                      {hasMore && (
                        <button
                          onClick={() => loadMore(status.key)}
                          className="w-full py-2 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg border border-dashed border-primary/40 transition-colors"
                        >
                          Carregar mais ({items.length - visibleItems.length} restantes)
                        </button>
                      )}
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

      <RenovacaoEditSheet
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        renovacaoId={editingItem?.id || null}
        formData={formData}
        setFormData={setFormData}
        formStatus={formStatus}
        setFormStatus={setFormStatus}
        formAssigned={formAssigned}
        setFormAssigned={setFormAssigned}
        formValor={formValor}
        setFormValor={setFormValor}
        statuses={statuses}
        profiles={profiles}
        fields={fields}
        saving={saving}
        onSave={handleSave}
        canReassign={isAdmin || isGerente}
      />

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

      <AlertDialog open={autoAssignConfirm} onOpenChange={open => !autoAssigning && setAutoAssignConfirm(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Distribuir {unassignedCount} lead{unassignedCount !== 1 ? "s" : ""} sem responsável?</AlertDialogTitle>
            <AlertDialogDescription>
              Os leads serão divididos em partes iguais (round-robin) entre os vendedores ativos de cada loja.
              {filterCompanyId !== "all" ? " Apenas a loja filtrada será afetada." : " Todas as lojas serão processadas."}
              {" "}Daqui pra frente, novos leads vindos do SSótica também recebem vendedor automaticamente quando não houver mapeamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={autoAssigning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={runAutoAssign} disabled={autoAssigning}>
              {autoAssigning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Distribuindo...</> : "Distribuir agora"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
