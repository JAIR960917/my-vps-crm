import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, Send, Users, Hash, Clock, Zap, Smartphone } from "lucide-react";

type Status = {
  id: string;
  key: string;
  label: string;
  color: string;
};

type TriggerStep = {
  id?: string;
  position: number;
  delay_days: number;
  message: string;
};

type TriggerCampaign = {
  id: string;
  name: string;
  status_id: string;
  instance_id: string | null;
  company_id: string | null;
  is_active: boolean;
  daily_limit: number;
  created_by: string;
  created_at: string;
  whatsapp_trigger_steps?: TriggerStep[];
};

type TriggerSendStats = {
  campaign_id: string;
  total: number;
  sent: number;
  error: number;
};

type Instance = {
  id: string;
  name: string;
  session: string;
  company_id: string | null;
  is_active: boolean;
};

type Company = { id: string; name: string };

interface Props {
  instances: Instance[];
}

export default function TriggerCampaigns({ instances }: Props) {
  const { user, isAdmin, isGerente } = useAuth();
  const [campaigns, setCampaigns] = useState<TriggerCampaign[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sendStats, setSendStats] = useState<Record<string, TriggerSendStats>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterCompanyId, setFilterCompanyId] = useState<string>("all");

  const [name, setName] = useState("");
  const [statusId, setStatusId] = useState("");
  const [instanceId, setInstanceId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [dailyLimit, setDailyLimit] = useState("15");
  const [steps, setSteps] = useState<TriggerStep[]>([
    { position: 0, delay_days: 0, message: "" },
  ]);

  const canManage = isAdmin;

  const fetchData = async () => {
    setLoading(true);
    const [campaignsRes, statusesRes, sendsRes, companiesRes] = await Promise.all([
      supabase
        .from("whatsapp_trigger_campaigns")
        .select("*, whatsapp_trigger_steps(*)")
        .order("created_at", { ascending: false }),
      supabase.from("crm_statuses").select("*").order("position"),
      supabase.from("whatsapp_trigger_sends").select("campaign_id, status"),
      supabase.from("companies").select("id, name").order("name"),
    ]);

    setCampaigns((campaignsRes.data || []) as any);
    setStatuses((statusesRes.data || []) as Status[]);
    setCompanies((companiesRes.data || []) as Company[]);

    const stats: Record<string, TriggerSendStats> = {};
    for (const send of (sendsRes.data || []) as { campaign_id: string; status: string }[]) {
      if (!stats[send.campaign_id]) {
        stats[send.campaign_id] = { campaign_id: send.campaign_id, total: 0, sent: 0, error: 0 };
      }
      stats[send.campaign_id].total++;
      if (send.status === "sent") stats[send.campaign_id].sent++;
      else if (send.status === "error") stats[send.campaign_id].error++;
    }
    setSendStats(stats);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setName("");
    setStatusId("");
    setInstanceId("");
    setCompanyId("");
    setDailyLimit("15");
    setSteps([{ position: 0, delay_days: 0, message: "" }]);
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (c: TriggerCampaign) => {
    setName(c.name);
    setStatusId(c.status_id);
    setInstanceId(c.instance_id || "");
    setCompanyId(c.company_id || "");
    setDailyLimit(String(c.daily_limit));
    const sorted = [...(c.whatsapp_trigger_steps || [])].sort((a, b) => a.position - b.position);
    setSteps(
      sorted.length > 0
        ? sorted.map((s) => ({ id: s.id, position: s.position, delay_days: s.delay_days, message: s.message }))
        : [{ position: 0, delay_days: 0, message: "" }]
    );
    setEditingId(c.id);
    setShowForm(true);
  };

  const addStep = () => {
    if (steps.length >= 5) {
      toast.error("Máximo de 5 etapas por campanha");
      return;
    }
    setSteps([...steps, { position: steps.length, delay_days: steps.length === 0 ? 0 : 3, message: "" }]);
  };

  const removeStep = (idx: number) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, position: i })));
  };

  const updateStep = (idx: number, field: keyof TriggerStep, value: any) => {
    setSteps(steps.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const handleSubmit = async () => {
    if (!name.trim() || !statusId || !companyId) {
      toast.error("Preencha empresa, nome e coluna");
      return;
    }
    if (steps.some((s) => !s.message.trim())) {
      toast.error("Preencha a mensagem de todas as etapas");
      return;
    }
    if (!user) return;
    setSaving(true);

    try {
      const payload: any = {
        name: name.trim(),
        status_id: statusId,
        daily_limit: parseInt(dailyLimit) || 15,
        created_by: user.id,
        instance_id: instanceId || null,
        company_id: companyId,
      };

      let campaignId = editingId;

      if (editingId) {
        const { error } = await supabase.from("whatsapp_trigger_campaigns").update(payload).eq("id", editingId);
        if (error) throw error;
        await supabase.from("whatsapp_trigger_steps").delete().eq("campaign_id", editingId);
      } else {
        const { data, error } = await supabase.from("whatsapp_trigger_campaigns").insert(payload).select("id").single();
        if (error) throw error;
        campaignId = data.id;
      }

      const stepsPayload = steps.map((s, i) => ({
        campaign_id: campaignId!,
        position: i,
        delay_days: s.delay_days,
        message: s.message.trim(),
      }));

      const { error: stepsError } = await supabase.from("whatsapp_trigger_steps").insert(stepsPayload);
      if (stepsError) throw stepsError;

      toast.success(editingId ? "Campanha atualizada!" : "Campanha criada!");
      resetForm();
      fetchData();
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e.message || "Erro desconhecido"));
      console.error(e);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta campanha por gatilho?")) return;
    const { error } = await supabase.from("whatsapp_trigger_campaigns").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else {
      toast.success("Campanha excluída");
      fetchData();
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    const { error } = await supabase.from("whatsapp_trigger_campaigns").update({ is_active: active }).eq("id", id);
    if (error) toast.error("Erro ao atualizar");
    else fetchData();
  };

  const getStatusLabel = (sid: string) => statuses.find((s) => s.id === sid)?.label || "—";
  const getStatusColor = (sid: string) => statuses.find((s) => s.id === sid)?.color || "gray";
  const getInstanceName = (iid: string | null) => instances.find((i) => i.id === iid)?.name || "—";
  const getCompanyName = (cid: string | null) => companies.find((c) => c.id === cid)?.name || "—";

  // When filtering by company, only show that company's instances
  const availableInstances = instances.filter(i => {
    if (!i.is_active) return false;
    if (!companyId) return true;
    return !i.company_id || i.company_id === companyId;
  });

  const filteredCampaigns = campaigns.filter(c =>
    filterCompanyId === "all" ? true : c.company_id === filterCompanyId
  );

  return (
    <div className="flex-1 flex flex-col">
      <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Filtrar por empresa:</Label>
          <Select value={filterCompanyId} onValueChange={setFilterCompanyId}>
            <SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as empresas</SelectItem>
              {companies.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              resetForm();
              if (filterCompanyId !== "all") setCompanyId(filterCompanyId);
              setShowForm(!showForm);
            }}
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1" />
            Nova Campanha por Gatilho
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-lg border bg-card p-4 mb-6 space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Zap className="h-4 w-4" />
            {editingId ? "Editar campanha por gatilho" : "Nova campanha por gatilho"}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Empresa *</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input placeholder="Ex: Sequência boas-vindas" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Coluna do Kanban *</Label>
              <Select value={statusId} onValueChange={setStatusId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Instância WhatsApp</Label>
              <Select value={instanceId} onValueChange={setInstanceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {availableInstances.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Limite diário *</Label>
              <Input type="number" min="1" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Etapas da sequência</Label>
              {steps.length < 5 && (
                <Button type="button" variant="outline" size="sm" onClick={addStep}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar etapa
                </Button>
              )}
            </div>

            {steps.map((step, idx) => (
              <div key={idx} className="rounded-md border p-3 space-y-2 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Etapa {idx + 1} — {idx === 0 && step.delay_days === 0 ? "Ao entrar na coluna" : `Após ${step.delay_days} dia(s)`}
                  </span>
                  {steps.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeStep(idx)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Dias de espera:</Label>
                  <Input
                    type="number"
                    min="0"
                    className="w-20 h-8 text-sm"
                    value={step.delay_days}
                    onChange={(e) => updateStep(idx, "delay_days", parseInt(e.target.value) || 0)}
                  />
                </div>
                <Textarea
                  placeholder="Mensagem desta etapa... Use {nome} para o nome do lead"
                  value={step.message}
                  onChange={(e) => updateStep(idx, "message", e.target.value)}
                  className="min-h-[70px] text-sm"
                />
              </div>
            ))}
          </div>

          <p className="text-[10px] text-muted-foreground">
            A campanha enviará apenas para leads (criados ou atribuídos) da empresa selecionada.
          </p>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={resetForm}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={saving}>
              <Send className="h-4 w-4 mr-1" />
              {saving ? "Salvando..." : editingId ? "Atualizar" : "Criar Campanha"}
            </Button>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1">
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Carregando...</p>
        ) : filteredCampaigns.length === 0 ? (
          <div className="text-center py-12">
            <Zap className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Nenhuma campanha por gatilho criada</p>
            <p className="text-muted-foreground text-xs mt-1">
              Crie sequências de mensagens automáticas que disparam quando um lead entra em uma coluna
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCampaigns.map((c) => {
              const stats = sendStats[c.id];
              const sortedSteps = [...(c.whatsapp_trigger_steps || [])].sort((a, b) => a.position - b.position);
              return (
                <div key={c.id} className={`rounded-lg border bg-card p-4 space-y-3 ${!c.is_active ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Zap className="h-4 w-4 text-amber-500" />
                        <span className="font-semibold text-sm">{c.name}</span>
                        <Badge variant="outline" style={{ borderColor: getStatusColor(c.status_id), color: getStatusColor(c.status_id) }}>
                          {getStatusLabel(c.status_id)}
                        </Badge>
                        {c.company_id ? (
                          <Badge variant="secondary" className="text-[10px]">{getCompanyName(c.company_id)}</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">Sem empresa</Badge>
                        )}
                        {c.instance_id && (
                          <Badge variant="secondary" className="text-[10px] flex items-center gap-1">
                            <Smartphone className="h-3 w-3" /> {getInstanceName(c.instance_id)}
                          </Badge>
                        )}
                        {c.is_active ? (
                          <Badge variant="outline" className="text-emerald-500 border-emerald-500">Ativa</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Inativa</Badge>
                        )}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Switch checked={c.is_active} onCheckedChange={(v) => handleToggle(c.id, v)} />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(c)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Steps preview */}
                  <div className="space-y-1">
                    {sortedSteps.map((step, idx) => (
                      <div key={step.id || idx} className="flex items-start gap-2 text-xs">
                        <div className="flex items-center gap-1 text-muted-foreground whitespace-nowrap mt-0.5">
                          <Clock className="h-3 w-3" />
                          {step.delay_days === 0 ? "Entrada" : `+${step.delay_days}d`}
                        </div>
                        <p className="bg-muted/50 rounded px-2 py-1 flex-1 line-clamp-2">{step.message}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Hash className="h-3 w-3" /> {c.daily_limit}/dia
                    </span>
                    <span className="flex items-center gap-1">
                      <Zap className="h-3 w-3" /> {sortedSteps.length} etapa(s)
                    </span>
                    {stats && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {stats.sent} enviados · {stats.error} erros · {stats.total} total
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
