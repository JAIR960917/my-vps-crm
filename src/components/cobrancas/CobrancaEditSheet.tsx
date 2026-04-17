import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { X, Plus, Trash2, CheckCircle2, Clock, FileText, CalendarIcon, AlertTriangle, CalendarClock, Pencil, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

type Profile = { user_id: string; full_name: string; avatar_url?: string | null };
type Company = { id: string; name: string };
type CrmStatus = { id: string; key: string; label: string };

type Activity = {
  id: string; cobranca_id: string; title: string; description: string | null;
  scheduled_date: string; completed_at: string | null; created_by: string; created_at: string;
};
type Note = {
  id: string; cobranca_id: string; user_id: string; content: string; created_at: string;
};

type ParcelaInfo = {
  id: string;
  numero_parcela: number | null;
  vencimento: string | null;
  valor: number;
  dias_atraso: number | null;
  status: string;
  is_current: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cobrancaId: string | null;
  ssoticaClienteId?: number | null;
  ssoticaCompanyId?: string | null;
  formData: Record<string, any>;
  setFormData: (d: Record<string, any>) => void;
  formStatus: string;
  setFormStatus: (s: string) => void;
  formAssigned: string;
  setFormAssigned: (s: string) => void;
  formValor: string;
  setFormValor: (s: string) => void;
  formCompanyId: string;
  setFormCompanyId: (s: string) => void;
  statuses: CrmStatus[];
  profiles: Profile[];
  companies: Company[];
  saving: boolean;
  onSave: (e: React.FormEvent) => void;
  canReassign: boolean;
};

export default function CobrancaEditSheet(props: Props) {
  const {
    open, onOpenChange, cobrancaId, ssoticaClienteId, ssoticaCompanyId,
    formData, setFormData,
    formStatus, setFormStatus, formAssigned, setFormAssigned,
    formValor, setFormValor, formCompanyId, setFormCompanyId,
    statuses, profiles, companies, saving, onSave, canReassign,
  } = props;
  const { user, isAdmin } = useAuth();

  const [tab, setTab] = useState("atividade");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [parcelas, setParcelas] = useState<ParcelaInfo[]>([]);
  const [loadingParcelas, setLoadingParcelas] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  // Task creation
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDate, setTaskDate] = useState<Date | undefined>(undefined);
  const [taskTime, setTaskTime] = useState("09:00");
  const [savingTask, setSavingTask] = useState(false);

  // Edit task inline
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [editTaskDescription, setEditTaskDescription] = useState("");
  const [editTaskDate, setEditTaskDate] = useState<Date | undefined>(undefined);
  const [editTaskTime, setEditTaskTime] = useState("09:00");
  const [savingEditTask, setSavingEditTask] = useState(false);

  const isEditing = !!cobrancaId;

  const fetchTimeline = async () => {
    if (!cobrancaId) return;
    const [{ data: acts }, { data: ns }] = await Promise.all([
      supabase.from("cobranca_activities").select("*").eq("cobranca_id", cobrancaId).order("scheduled_date", { ascending: false }),
      supabase.from("crm_cobranca_notes").select("*").eq("cobranca_id", cobrancaId).order("created_at", { ascending: false }),
    ]);
    setActivities((acts || []) as Activity[]);
    setNotes((ns || []) as Note[]);
  };

  useEffect(() => {
    if (open && cobrancaId) {
      fetchTimeline();
      setTab("atividade");
      setNewComment("");
      setTaskOpen(false);
    }
  }, [open, cobrancaId]);

  const timeline = useMemo(() => {
    const items = [
      ...activities.map(a => ({ id: a.id, type: "activity" as const, date: a.scheduled_date, data: a })),
      ...notes.map(n => ({ id: n.id, type: "note" as const, date: n.created_at, data: n })),
    ];
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activities, notes]);

  const handlePostComment = async () => {
    if (!cobrancaId || !newComment.trim() || !user) return;
    setPostingComment(true);
    const { error } = await supabase.from("crm_cobranca_notes").insert({
      cobranca_id: cobrancaId, user_id: user.id, content: newComment.trim(),
    });
    if (error) { toast.error("Erro ao adicionar comentário"); }
    else { setNewComment(""); fetchTimeline(); }
    setPostingComment(false);
  };

  const handleCreateTask = async () => {
    if (!cobrancaId || !taskTitle.trim() || !taskDate || !user) {
      toast.error("Preencha título e data"); return;
    }
    setSavingTask(true);
    const [h, m] = taskTime.split(":").map(Number);
    const dt = new Date(taskDate); dt.setHours(h || 9, m || 0, 0, 0);
    const { error } = await supabase.from("cobranca_activities").insert({
      cobranca_id: cobrancaId, created_by: user.id,
      title: taskTitle.trim(), description: taskDescription.trim() || null,
      scheduled_date: dt.toISOString(),
    });
    if (error) toast.error("Erro ao criar tarefa");
    else {
      toast.success("Tarefa criada");
      setTaskOpen(false); setTaskTitle(""); setTaskDescription(""); setTaskDate(undefined); setTaskTime("09:00");
      fetchTimeline();
    }
    setSavingTask(false);
  };

  const toggleTaskComplete = async (a: Activity) => {
    const newVal = a.completed_at ? null : new Date().toISOString();
    const { error } = await supabase.from("cobranca_activities")
      .update({ completed_at: newVal }).eq("id", a.id);
    if (error) toast.error("Erro");
    else fetchTimeline();
  };

  const deleteActivity = async (id: string) => {
    const { error } = await supabase.from("cobranca_activities").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir"); else fetchTimeline();
  };

  const deleteNote = async (id: string) => {
    const { error } = await supabase.from("crm_cobranca_notes").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir"); else fetchTimeline();
  };

  const getProfile = (uid: string) => profiles.find(p => p.user_id === uid);

  const startEditTask = (a: Activity) => {
    setEditingTaskId(a.id);
    setEditTaskTitle(a.title);
    setEditTaskDescription(a.description || "");
    const d = new Date(a.scheduled_date);
    setEditTaskDate(d);
    setEditTaskTime(format(d, "HH:mm"));
  };

  const handleUpdateTask = async () => {
    if (!editingTaskId || !editTaskTitle.trim() || !editTaskDate) return;
    setSavingEditTask(true);
    const [h, m] = editTaskTime.split(":").map(Number);
    const dt = new Date(editTaskDate); dt.setHours(h || 9, m || 0, 0, 0);
    const { error } = await supabase.from("cobranca_activities").update({
      title: editTaskTitle.trim(),
      description: editTaskDescription.trim() || null,
      scheduled_date: dt.toISOString(),
    }).eq("id", editingTaskId);
    if (error) toast.error("Erro ao atualizar tarefa");
    else {
      toast.success("Tarefa atualizada");
      setEditingTaskId(null);
      fetchTimeline();
    }
    setSavingEditTask(false);
  };

  const getTaskStatus = (a: Activity): "completed" | "overdue" | "today" | "pending" => {
    if (a.completed_at) return "completed";
    const now = new Date();
    const d = new Date(a.scheduled_date);
    if (d < now) return "overdue";
    if (d.toDateString() === now.toDateString()) return "today";
    return "pending";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[1100px] p-0 flex flex-col sm:flex-row gap-0"
      >
        {/* LEFT: Form */}
        <div className="w-full sm:w-[420px] sm:border-r border-border flex flex-col bg-card">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="font-semibold text-lg">
              {isEditing ? "Editar Cobrança" : "Nova Cobrança"}
            </h2>
          </div>
          <ScrollArea className="flex-1">
            <form onSubmit={onSave} id="cobranca-form" className="p-5 space-y-4">
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Select value={formCompanyId} onValueChange={setFormCompanyId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar empresa..." /></SelectTrigger>
                  <SelectContent>
                    {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Coluna (Status)</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statuses.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {canReassign && (
                <div className="space-y-2">
                  <Label>Atribuído a</Label>
                  <Select value={formAssigned} onValueChange={setFormAssigned}>
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      {profiles.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Nome <span className="text-destructive">*</span></Label>
                <Input value={formData.nome || ""} required
                  onChange={e => setFormData({ ...formData, nome: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={formData.telefone || ""} placeholder="(00) 00000-0000"
                  onChange={e => setFormData({ ...formData, telefone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>CPF</Label>
                <Input value={formData.documento || formData.cpf || ""} placeholder="000.000.000-00"
                  onChange={e => setFormData({ ...formData, documento: e.target.value, cpf: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" value={formValor} placeholder="0,00"
                  onChange={e => setFormValor(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea rows={3} value={formData.descricao || ""}
                  onChange={e => setFormData({ ...formData, descricao: e.target.value })} />
              </div>
              <Button type="submit" form="cobranca-form" className="w-full" disabled={saving || !formData.nome?.trim()}>
                {saving ? "Salvando..." : isEditing ? "Atualizar" : "Criar"}
              </Button>
            </form>
          </ScrollArea>
        </div>

        {/* RIGHT: Timeline */}
        <div className="flex-1 flex flex-col bg-background min-w-0">
          <div className="flex items-center justify-between px-5 py-3 border-b">
            <Tabs value={tab} onValueChange={setTab} className="flex-1">
              <TabsList className="bg-transparent">
                <TabsTrigger value="atividade" className="data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground">Atividade</TabsTrigger>
                <TabsTrigger value="comentario">Comentário</TabsTrigger>
                <TabsTrigger value="tarefa">Tarefa</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {!isEditing ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8 text-center">
              Salve a cobrança primeiro para adicionar comentários e tarefas.
            </div>
          ) : (
            <>
              {/* Comment / Task input bar */}
              <div className="px-5 py-3 border-b flex items-center gap-2">
                <Input
                  placeholder="Adicionar comentário..."
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handlePostComment(); } }}
                />
                <Button onClick={handlePostComment} disabled={postingComment || !newComment.trim()} variant="destructive">
                  Enviar
                </Button>
                <Popover open={taskOpen} onOpenChange={setTaskOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-1" /> Tarefa
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" align="end">
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm">Nova Tarefa</h4>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Título</Label>
                        <Input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Ligar para cliente..." />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Descrição (opcional)</Label>
                        <Textarea rows={2} value={taskDescription} onChange={e => setTaskDescription(e.target.value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Data</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className={cn("w-full justify-start", !taskDate && "text-muted-foreground")}>
                                <CalendarIcon className="h-3 w-3 mr-1" />
                                {taskDate ? format(taskDate, "dd/MM/yy") : "Selecionar"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar mode="single" selected={taskDate} onSelect={setTaskDate} locale={ptBR} />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Hora</Label>
                          <Input type="time" value={taskTime} onChange={e => setTaskTime(e.target.value)} />
                        </div>
                      </div>
                      <Button onClick={handleCreateTask} disabled={savingTask} className="w-full" size="sm">
                        {savingTask ? "Criando..." : "Criar tarefa"}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Timeline */}
              <ScrollArea className="flex-1">
                <div className="p-5 space-y-3">
                  {tab === "atividade" && timeline.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-12">Nenhuma atividade registrada ainda.</p>
                  )}
                  {tab === "comentario" && notes.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-12">Nenhum comentário ainda.</p>
                  )}
                  {tab === "tarefa" && activities.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-12">Nenhuma tarefa criada.</p>
                  )}

                  {(tab === "atividade" ? timeline
                    : tab === "comentario" ? timeline.filter(t => t.type === "note")
                    : timeline.filter(t => t.type === "activity")
                  ).map(item => {
                    if (item.type === "note") {
                      const n = item.data as Note;
                      const p = getProfile(n.user_id);
                      return (
                        <div key={n.id} className="flex gap-3 group">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarImage src={p?.avatar_url || ""} />
                            <AvatarFallback className="text-xs">{(p?.full_name || "?").charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                              <span className="font-medium text-foreground">{p?.full_name || "Usuário"}</span>
                              <FileText className="h-3 w-3" />
                              <span>comentou {formatDistanceToNow(new Date(n.created_at), { locale: ptBR, addSuffix: true })}</span>
                            </div>
                            <div className="bg-card border rounded-lg p-3 text-sm whitespace-pre-wrap">{n.content}</div>
                          </div>
                          {(n.user_id === user?.id || isAdmin) && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => deleteNote(n.id)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          )}
                        </div>
                      );
                    } else {
                      const a = item.data as Activity;
                      const p = getProfile(a.created_by);
                      const status = getTaskStatus(a);
                      const canEdit = a.created_by === user?.id || isAdmin;

                      let iconBg = "bg-muted text-muted-foreground";
                      let labelClass = "text-muted-foreground bg-muted";
                      let label = "PENDENTE";
                      let cardClass = "border-border bg-card";

                      if (status === "completed") {
                        iconBg = "bg-emerald-500/20 text-emerald-500";
                        labelClass = "text-emerald-500 bg-emerald-500/15";
                        label = "CONCLUÍDA";
                        cardClass = "border-emerald-500/30 bg-emerald-500/5";
                      } else if (status === "overdue") {
                        iconBg = "bg-red-500/20 text-red-500";
                        labelClass = "text-red-500 bg-red-500/15";
                        label = "ATRASADA";
                        cardClass = "border-red-500/40 bg-red-500/5";
                      } else if (status === "today") {
                        iconBg = "bg-amber-500/20 text-amber-500";
                        labelClass = "text-amber-500 bg-amber-500/15";
                        label = "HOJE";
                        cardClass = "border-amber-500/40 bg-amber-500/5";
                      } else {
                        iconBg = "bg-blue-500/20 text-blue-500";
                        labelClass = "text-blue-500 bg-blue-500/15";
                      }

                      let scheduledFmt = "";
                      try { scheduledFmt = format(new Date(a.scheduled_date), "EEE, dd 'de' MMM, HH:mm", { locale: ptBR }); }
                      catch { scheduledFmt = a.scheduled_date; }

                      return (
                        <div key={a.id} className="relative pl-10 group">
                          {/* Timeline dot */}
                          <div className={cn("absolute left-1 top-1 w-7 h-7 rounded-full flex items-center justify-center", iconBg)}>
                            {status === "completed" ? <CheckCircle2 className="h-4 w-4" /> :
                             status === "overdue" ? <AlertTriangle className="h-4 w-4" /> :
                             <CalendarClock className="h-4 w-4" />}
                          </div>

                          <div className={cn("rounded-lg border p-3", cardClass)}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-foreground">Tarefa</span>
                                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", labelClass)}>{label}</span>
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(a.created_at), "dd/MM/yyyy, HH:mm", { locale: ptBR })}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                {p && (
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={p.avatar_url ?? undefined} />
                                    <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                                      {(p.full_name || "?").slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                )}
                                {canEdit && (
                                  <>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => startEditTask(a)}>
                                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => deleteActivity(a.id)}>
                                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>

                            {editingTaskId === a.id ? (
                              <div className="mt-2 rounded-md bg-background/60 p-2.5 space-y-2">
                                <Input value={editTaskTitle} onChange={e => setEditTaskTitle(e.target.value)} placeholder="Título..." className="h-8 text-sm" />
                                <Textarea value={editTaskDescription} onChange={e => setEditTaskDescription(e.target.value)} placeholder="Descrição (opcional)..." rows={2} className="text-sm" />
                                <div className="flex gap-2">
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button variant="outline" className="flex-1 justify-start text-left h-8 text-sm">
                                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                                        {editTaskDate ? format(editTaskDate, "dd/MM/yyyy", { locale: ptBR }) : "Data"}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                      <Calendar mode="single" selected={editTaskDate} onSelect={setEditTaskDate} locale={ptBR} className="p-3 pointer-events-auto" />
                                    </PopoverContent>
                                  </Popover>
                                  <div className="relative">
                                    <Clock className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                    <Input type="time" value={editTaskTime} onChange={e => setEditTaskTime(e.target.value)} className="h-8 text-sm pl-8 w-[110px]" />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setEditingTaskId(null)}>Cancelar</Button>
                                  <Button size="sm" className="text-xs h-7" onClick={handleUpdateTask} disabled={savingEditTask || !editTaskTitle.trim() || !editTaskDate}>
                                    {savingEditTask ? "Salvando..." : "Salvar"}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="mt-2 rounded-md bg-background/40 p-2.5">
                                  <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                      <span className="text-muted-foreground text-xs">Prazo</span>
                                      <p className={cn("font-medium text-xs", status === "overdue" && "text-red-500")}>{scheduledFmt}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground text-xs">Título</span>
                                      <p className={cn("font-medium text-xs", status === "completed" && "line-through text-muted-foreground")}>{a.title}</p>
                                    </div>
                                  </div>
                                  {a.description && (
                                    <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap">{a.description}</p>
                                  )}
                                  {p && (
                                    <div className="mt-1.5">
                                      <span className="text-muted-foreground text-xs">Responsável</span>
                                      <p className="text-xs font-medium text-primary">{p.full_name}</p>
                                    </div>
                                  )}
                                </div>

                                <div className="flex gap-2 mt-2">
                                  <Button
                                    size="sm"
                                    variant={status === "completed" ? "outline" : "destructive"}
                                    className="text-xs h-7"
                                    onClick={() => toggleTaskComplete(a)}
                                  >
                                    {status === "completed" ? "Reabrir" : "Concluir"}
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    }
                  })}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
