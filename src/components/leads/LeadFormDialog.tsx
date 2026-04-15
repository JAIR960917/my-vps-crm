import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatPhoneBR } from "@/lib/phoneFormat";
import { ArrowLeft, Check, Eye, Plus, CalendarClock, CheckCircle2, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Profile = { user_id: string; full_name: string; email?: string; avatar_url?: string | null };
type Company = { id: string; name: string };

type FormField = {
  id: string;
  label: string;
  field_type: string;
  options: string[] | null;
  position: number;
  is_required: boolean;
  parent_field_id: string | null;
  parent_trigger_value: string | null;
  status_mapping: Record<string, string> | null;
  date_status_ranges: { ranges: { max_years: number; status_key: string }[]; above_all: string; no_answer: string } | null;
};

type Activity = {
  id: string;
  lead_id: string;
  title: string;
  description: string | null;
  scheduled_date: string;
  completed_at: string | null;
  created_by: string;
  created_at: string;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profiles: Profile[];
  companies: Company[];
  currentUserName: string;
  formData: Record<string, any>;
  setFormData: (d: Record<string, any>) => void;
  formStatus: string;
  setFormStatus: (s: string) => void;
  formAssigned: string;
  setFormAssigned: (s: string) => void;
  saving: boolean;
  isEditing: boolean;
  canReassign?: boolean;
  onSubmit: (e: React.FormEvent) => void;
  statusOptions: string[];
  statusLabels: Record<string, string>;
  leadId?: string | null;
  onActivityChange?: () => void;
};

export default function LeadFormDialog({
  open, onOpenChange, profiles, companies, currentUserName,
  formData, setFormData, formStatus, setFormStatus, formAssigned,
  setFormAssigned, saving, isEditing, canReassign, onSubmit, statusOptions, statusLabels,
  leadId, onActivityChange,
}: Props) {
  const { user, isAdmin } = useAuth();
  const [fields, setFields] = useState<FormField[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [activeTab, setActiveTab] = useState<"dados" | "atividades">("dados");

  // Activity state
  const [activities, setActivities] = useState<Activity[]>([]);
  const [showNewActivity, setShowNewActivity] = useState(false);
  const [actTitle, setActTitle] = useState("");
  const [actDescription, setActDescription] = useState("");
  const [actDate, setActDate] = useState("");
  const [actSaving, setActSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setShowPreview(false);
      setActiveTab("dados");
      setShowNewActivity(false);
      supabase
        .from("crm_form_fields")
        .select("*")
        .order("position")
        .then(({ data }) => setFields((data || []) as unknown as FormField[]));
      if (isEditing && leadId) {
        fetchActivities();
      }
    }
  }, [open, leadId]);

  const fetchActivities = async () => {
    if (!leadId) return;
    const { data } = await supabase
      .from("lead_activities")
      .select("*")
      .eq("lead_id", leadId)
      .order("scheduled_date", { ascending: false });
    setActivities((data || []) as Activity[]);
  };

  const set = (key: string, val: any) => setFormData({ ...formData, [key]: val });

  const toggleArray = (key: string, item: string) => {
    const arr: string[] = formData[key] || [];
    set(key, arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]);
  };

  const isFieldVisible = (field: FormField): boolean => {
    if (!field.parent_field_id) return true;
    const parent = fields.find((f) => f.id === field.parent_field_id);
    if (!parent) return false;
    if (!isFieldVisible(parent)) return false;
    if (!field.parent_trigger_value) return true;
    const parentValue = formData[`field_${parent.id}`];
    let triggerValues: string[];
    try {
      const parsed = JSON.parse(field.parent_trigger_value);
      triggerValues = Array.isArray(parsed) ? parsed : [field.parent_trigger_value];
    } catch {
      triggerValues = [field.parent_trigger_value];
    }
    if (Array.isArray(parentValue)) {
      return parentValue.some((v: string) => triggerValues.includes(v));
    }
    return triggerValues.includes(parentValue);
  };

  const renderFormField = (field: FormField) => {
    if (!isFieldVisible(field)) return null;
    const fieldKey = `field_${field.id}`;
    const value = formData[fieldKey] || "";

    return (
      <div key={field.id} className={`space-y-2 ${field.parent_field_id ? "ml-4 pl-3 border-l-2 border-primary/20" : ""}`}>
        <Label>
          {field.label}
          {field.is_required && <span className="text-destructive ml-1">*</span>}
        </Label>

        {field.field_type === "select" && field.options && (
          <Select value={value} onValueChange={(v) => set(fieldKey, v)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {field.options.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {field.field_type === "checkbox_group" && field.options && (
          <div className="flex flex-wrap gap-2">
            {field.options.map((opt) => {
              const arr: string[] = formData[fieldKey] || [];
              const checked = arr.includes(opt);
              return (
                <label
                  key={opt}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm cursor-pointer transition-colors ${
                    checked ? "bg-primary/10 border-primary text-primary" : "bg-muted/50 border-border text-foreground hover:bg-muted"
                  }`}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggleArray(fieldKey, opt)} className="h-3.5 w-3.5" />
                  {opt}
                </label>
              );
            })}
          </div>
        )}

        {field.field_type === "textarea" && (
          <Textarea value={value} onChange={(e) => set(fieldKey, e.target.value)} rows={3} />
        )}

        {field.field_type === "phone" && (
          <Input
            type="tel"
            inputMode="numeric"
            placeholder="(00) 00000-0000"
            value={formatPhoneBR(value)}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
              set(fieldKey, digits);
            }}
            required={field.is_required}
            maxLength={16}
          />
        )}

        {["text", "number", "date", "email"].includes(field.field_type) && (
          <Input
            type={field.field_type}
            value={value}
            onChange={(e) => set(fieldKey, e.target.value)}
            required={field.is_required}
          />
        )}

        {!["select", "checkbox_group", "textarea", "phone", "text", "number", "date", "email"].includes(field.field_type) && (
          <Input
            type="text"
            value={value}
            onChange={(e) => set(fieldKey, e.target.value)}
            required={field.is_required}
          />
        )}
      </div>
    );
  };

  const rootFields = fields.filter((f) => !f.parent_field_id).sort((a, b) => a.position - b.position);

  const renderFieldTree = (field: FormField): React.ReactNode => {
    const children = fields
      .filter((f) => f.parent_field_id === field.id)
      .sort((a, b) => a.position - b.position);

    return (
      <div key={field.id}>
        {renderFormField(field)}
        {children.map((child) => renderFieldTree(child))}
      </div>
    );
  };

  const hasMappingField = fields.some(f => (f.status_mapping && Object.keys(f.status_mapping).length > 0) || f.date_status_ranges);

  const getVisibleAnswers = () => {
    const answers: { label: string; value: string }[] = [];
    const processField = (field: FormField) => {
      if (!isFieldVisible(field)) return;
      const fieldKey = `field_${field.id}`;
      const raw = formData[fieldKey];
      let display = "";
      if (Array.isArray(raw)) {
        display = raw.length > 0 ? raw.join(", ") : "—";
      } else {
        display = raw ? String(raw) : "—";
      }
      answers.push({ label: field.label, value: display });
      fields
        .filter((f) => f.parent_field_id === field.id)
        .sort((a, b) => a.position - b.position)
        .forEach(processField);
    };
    rootFields.forEach(processField);
    return answers;
  };

  const handlePreview = () => setShowPreview(true);
  const handleBackToForm = () => setShowPreview(false);

  const handleConfirmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(e);
  };

  // Activity handlers
  const handleCreateActivity = async () => {
    if (!actTitle.trim() || !actDate || !leadId || !user) return;
    setActSaving(true);
    const { error } = await supabase.from("lead_activities").insert({
      lead_id: leadId,
      title: actTitle.trim(),
      description: actDescription.trim() || null,
      scheduled_date: new Date(actDate).toISOString(),
      created_by: user.id,
    });
    if (error) {
      toast.error("Erro ao criar atividade");
    } else {
      toast.success("Atividade criada!");
      setActTitle("");
      setActDescription("");
      setActDate("");
      setShowNewActivity(false);
      fetchActivities();
      onActivityChange?.();
    }
    setActSaving(false);
  };

  const handleToggleComplete = async (activity: Activity) => {
    const newVal = activity.completed_at ? null : new Date().toISOString();
    const { error } = await supabase.from("lead_activities").update({ completed_at: newVal }).eq("id", activity.id);
    if (error) toast.error("Erro ao atualizar atividade");
    else {
      fetchActivities();
      onActivityChange?.();
    }
  };

  const handleDeleteActivity = async (id: string) => {
    const { error } = await supabase.from("lead_activities").delete().eq("id", id);
    if (error) toast.error("Erro ao remover atividade");
    else {
      fetchActivities();
      onActivityChange?.();
    }
  };

  const getActivityStatus = (act: Activity) => {
    if (act.completed_at) return "completed";
    const now = new Date();
    const scheduled = new Date(act.scheduled_date);
    if (scheduled < now) return "overdue";
    // Same day
    if (scheduled.toDateString() === now.toDateString()) return "today";
    return "pending";
  };

  const getProfile = (userId: string) => profiles.find(p => p.user_id === userId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {showPreview
              ? "📋 Revisão das Respostas"
              : isEditing ? "Editar Lead" : "Novo Lead"}
          </DialogTitle>
        </DialogHeader>

        {/* Tabs when editing */}
        {isEditing && !showPreview && (
          <div className="flex border-b mb-2">
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "dados"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab("dados")}
            >
              Dados
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "atividades"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTab("atividades")}
            >
              <CalendarClock className="h-4 w-4" />
              Atividades
              {activities.length > 0 && (
                <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{activities.length}</span>
              )}
            </button>
          </div>
        )}

        {showPreview ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Confira as respostas antes de salvar o lead:
            </p>

            <div className="rounded-lg border bg-muted/30 divide-y divide-border">
              <div className="flex justify-between items-center px-4 py-2.5">
                <span className="text-sm font-medium text-muted-foreground">Empresa</span>
                <span className="text-sm text-foreground font-medium">
                  {companies.length > 0 ? companies.map(c => c.name).join(", ") : "—"}
                </span>
              </div>
              <div className="flex justify-between items-center px-4 py-2.5">
                <span className="text-sm font-medium text-muted-foreground">Vendedor</span>
                <span className="text-sm text-foreground font-medium">{currentUserName || "—"}</span>
              </div>
              {(isEditing || !hasMappingField) && (
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-sm font-medium text-muted-foreground">Coluna</span>
                  <span className="text-sm text-foreground font-medium">{statusLabels[formStatus] || formStatus}</span>
                </div>
              )}
              {getVisibleAnswers().map((item, i) => (
                <div key={i} className="flex justify-between items-start px-4 py-2.5 gap-4">
                  <span className="text-sm font-medium text-muted-foreground shrink-0">{item.label}</span>
                  <span className="text-sm text-foreground font-medium text-right">{item.value}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={handleBackToForm}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar e Editar
              </Button>
              <Button type="button" className="flex-1" disabled={saving} onClick={handleConfirmSubmit}>
                {saving ? "Salvando..." : <><Check className="h-4 w-4 mr-1" /> Confirmar</>}
              </Button>
            </div>
          </div>
        ) : activeTab === "atividades" && isEditing ? (
          /* ====== ACTIVITIES TAB ====== */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Gerencie as atividades deste lead
              </p>
              <Button size="sm" variant="outline" onClick={() => setShowNewActivity(!showNewActivity)}>
                <Plus className="h-4 w-4 mr-1" />
                Nova Atividade
              </Button>
            </div>

            {/* New activity form */}
            {showNewActivity && (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="space-y-2">
                  <Label>Título da atividade <span className="text-destructive">*</span></Label>
                  <Input
                    value={actTitle}
                    onChange={(e) => setActTitle(e.target.value)}
                    placeholder="Ex: Contatar cliente, Apresentar orçamento..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={actDescription}
                    onChange={(e) => setActDescription(e.target.value)}
                    placeholder="Detalhes da atividade..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data prevista <span className="text-destructive">*</span></Label>
                  <Input
                    type="datetime-local"
                    value={actDate}
                    onChange={(e) => setActDate(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowNewActivity(false)}>Cancelar</Button>
                  <Button size="sm" onClick={handleCreateActivity} disabled={actSaving || !actTitle.trim() || !actDate}>
                    {actSaving ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </div>
            )}

            {/* Activities list */}
            <ScrollArea className="max-h-[45vh]">
              {activities.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">
                  Nenhuma atividade registrada.
                </p>
              ) : (
                <div className="space-y-2">
                  {activities.map((act) => {
                    const status = getActivityStatus(act);
                    const profile = getProfile(act.created_by);
                    const canDelete = act.created_by === user?.id || isAdmin;

                    let borderClass = "border-border";
                    let iconEl = <CalendarClock className="h-4 w-4 text-muted-foreground" />;
                    if (status === "completed") {
                      borderClass = "border-emerald-300 bg-emerald-500/5";
                      iconEl = <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
                    } else if (status === "overdue") {
                      borderClass = "border-red-400 bg-red-500/10";
                      iconEl = <AlertTriangle className="h-4 w-4 text-red-500" />;
                    } else if (status === "today") {
                      borderClass = "border-amber-300 bg-amber-500/5";
                      iconEl = <CalendarClock className="h-4 w-4 text-amber-500" />;
                    }

                    let scheduledFormatted = "";
                    try {
                      scheduledFormatted = format(new Date(act.scheduled_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
                    } catch {
                      scheduledFormatted = act.scheduled_date;
                    }

                    return (
                      <div key={act.id} className={`group rounded-lg border p-3 ${borderClass}`}>
                        <div className="flex items-start gap-2">
                          <button
                            onClick={() => handleToggleComplete(act)}
                            className="shrink-0 mt-0.5"
                            title={status === "completed" ? "Marcar como pendente" : "Marcar como concluída"}
                          >
                            {iconEl}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                              {act.title}
                            </p>
                            {act.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{act.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[11px] text-muted-foreground">📅 {scheduledFormatted}</span>
                              {status === "overdue" && (
                                <span className="text-[10px] font-medium text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded">Atrasada</span>
                              )}
                              {status === "today" && (
                                <span className="text-[10px] font-medium text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">Hoje</span>
                              )}
                              {status === "completed" && (
                                <span className="text-[10px] font-medium text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded">Concluída</span>
                              )}
                            </div>
                            {profile && (
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <Avatar className="h-4 w-4">
                                  <AvatarImage src={profile.avatar_url ?? undefined} />
                                  <AvatarFallback className="bg-primary/10 text-primary text-[8px]">
                                    {(profile.full_name || "?").slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-[11px] text-muted-foreground">{profile.full_name}</span>
                              </div>
                            )}
                          </div>
                          {canDelete && (
                            <Button
                              variant="ghost" size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              onClick={() => handleDeleteActivity(act.id)}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          /* ====== FORM STEP ====== */
          <form onSubmit={(e) => { e.preventDefault(); if (!isEditing && fields.length > 0) { handlePreview(); } else { onSubmit(e); } }} className="space-y-4">
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Input value={companies.length > 0 ? companies.map(c => c.name).join(", ") : "Nenhuma empresa"} readOnly className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Vendedor Responsável</Label>
              <Input value={currentUserName || "—"} readOnly className="bg-muted" />
            </div>

            {(isEditing || !hasMappingField) && (
              <div className="space-y-2">
                <Label>Coluna (Status) <span className="text-destructive">*</span></Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => (
                      <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!isEditing && hasMappingField && (
              <p className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
                ℹ️ A coluna será definida automaticamente com base nas respostas.
              </p>
            )}

            {isEditing && canReassign && (
              <div className="space-y-2">
                <Label>Atribuído a</Label>
                <Select value={formAssigned || "__none__"} onValueChange={(v) => setFormAssigned(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Ninguém" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Ninguém</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {rootFields.map((field) => renderFieldTree(field))}

            {fields.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma pergunta configurada. Vá em "Formulário" no menu para criar perguntas.
              </p>
            )}

            <Button type="submit" className="w-full" disabled={saving}>
              {saving
                ? "Salvando..."
                : isEditing
                  ? "Atualizar"
                  : fields.length > 0
                    ? <><Eye className="h-4 w-4 mr-1" /> Revisar Respostas</>
                    : "Enviar"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
