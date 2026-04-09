import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { MessageSquare, Plus, Trash2, Edit2, Send, Users, Calendar, Hash, Power } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Campaign = {
  id: string;
  name: string;
  message: string;
  status_id: string;
  daily_limit: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
};

type Status = {
  id: string;
  key: string;
  label: string;
  color: string;
};

type SendStats = {
  campaign_id: string;
  total: number;
  sent: number;
  pending: number;
  error: number;
};

export default function WhatsAppPage() {
  const { user, isAdmin, isGerente } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [sendStats, setSendStats] = useState<Record<string, SendStats>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [statusId, setStatusId] = useState("");
  const [dailyLimit, setDailyLimit] = useState("15");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  const canManage = isAdmin || isGerente;

  const fetchData = async () => {
    setLoading(true);
    const [campaignsRes, statusesRes, sendsRes] = await Promise.all([
      supabase.from("whatsapp_campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("crm_statuses").select("*").order("position"),
      supabase.from("whatsapp_campaign_sends").select("campaign_id, status"),
    ]);

    setCampaigns((campaignsRes.data || []) as Campaign[]);
    setStatuses((statusesRes.data || []) as Status[]);

    // Calculate stats per campaign
    const stats: Record<string, SendStats> = {};
    for (const send of (sendsRes.data || []) as { campaign_id: string; status: string }[]) {
      if (!stats[send.campaign_id]) {
        stats[send.campaign_id] = { campaign_id: send.campaign_id, total: 0, sent: 0, pending: 0, error: 0 };
      }
      stats[send.campaign_id].total++;
      if (send.status === "sent") stats[send.campaign_id].sent++;
      else if (send.status === "pending") stats[send.campaign_id].pending++;
      else if (send.status === "error") stats[send.campaign_id].error++;
    }
    setSendStats(stats);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const resetForm = () => {
    setName(""); setMessage(""); setStatusId(""); setDailyLimit("15");
    setStartDate(""); setEndDate(""); setEditingId(null); setShowForm(false);
  };

  const handleEdit = (c: Campaign) => {
    setName(c.name);
    setMessage(c.message);
    setStatusId(c.status_id);
    setDailyLimit(String(c.daily_limit));
    setStartDate(c.start_date);
    setEndDate(c.end_date);
    setEditingId(c.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !message.trim() || !statusId || !startDate || !endDate || !dailyLimit) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (!user) return;
    setSaving(true);

    const payload = {
      name: name.trim(),
      message: message.trim(),
      status_id: statusId,
      daily_limit: parseInt(dailyLimit) || 15,
      start_date: startDate,
      end_date: endDate,
      created_by: user.id,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("whatsapp_campaigns").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("whatsapp_campaigns").insert(payload));
    }

    if (error) {
      toast.error("Erro ao salvar campanha");
      console.error(error);
    } else {
      toast.success(editingId ? "Campanha atualizada!" : "Campanha criada!");
      resetForm();
      fetchData();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta campanha?")) return;
    const { error } = await supabase.from("whatsapp_campaigns").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir campanha");
    else { toast.success("Campanha excluída"); fetchData(); }
  };

  const handleToggle = async (id: string, active: boolean) => {
    const { error } = await supabase.from("whatsapp_campaigns").update({ is_active: active }).eq("id", id);
    if (error) toast.error("Erro ao atualizar campanha");
    else fetchData();
  };

  const getStatusLabel = (sid: string) => statuses.find(s => s.id === sid)?.label || "—";
  const getStatusColor = (sid: string) => statuses.find(s => s.id === sid)?.color || "gray";

  return (
    <AppLayout>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" />
            Campanhas WhatsApp
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Crie mensagens automáticas vinculadas a colunas do kanban
          </p>
        </div>
        {canManage && (
          <Button onClick={() => { resetForm(); setShowForm(!showForm); }} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Nova Campanha
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-lg border bg-card p-4 mb-6 space-y-4">
          <h3 className="font-semibold text-sm">{editingId ? "Editar campanha" : "Nova campanha"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome da campanha *</Label>
              <Input placeholder="Ex: Boas-vindas novos leads" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Coluna do Kanban *</Label>
              <Select value={statusId} onValueChange={setStatusId}>
                <SelectTrigger><SelectValue placeholder="Selecione a coluna..." /></SelectTrigger>
                <SelectContent>
                  {statuses.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Limite diário de envios *</Label>
              <Input type="number" min="1" value={dailyLimit} onChange={e => setDailyLimit(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">Quantas mensagens por dia para evitar banimento</p>
            </div>
            <div className="space-y-2">
              <Label>Data início *</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data fim *</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Mensagem padrão *</Label>
            <Textarea
              placeholder="Digite a mensagem que será enviada para os leads desta coluna..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="min-h-[100px]"
            />
            <p className="text-[10px] text-muted-foreground">
              Use {"{nome}"} para inserir o nome do lead automaticamente
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={resetForm}>Cancelar</Button>
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
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Nenhuma campanha criada</p>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map(c => {
              const stats = sendStats[c.id];
              return (
                <div key={c.id} className={`rounded-lg border bg-card p-4 space-y-3 ${!c.is_active ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{c.name}</span>
                        <Badge variant="outline" style={{ borderColor: getStatusColor(c.status_id), color: getStatusColor(c.status_id) }}>
                          {getStatusLabel(c.status_id)}
                        </Badge>
                        {c.is_active ? (
                          <Badge variant="outline" className="text-emerald-500 border-emerald-500">Ativa</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Inativa</Badge>
                        )}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Switch checked={c.is_active} onCheckedChange={v => handleToggle(c.id, v)} />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(c)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <p className="text-sm bg-muted/50 rounded-md p-2 whitespace-pre-wrap">{c.message}</p>

                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Hash className="h-3 w-3" /> {c.daily_limit}/dia
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(c.start_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })} — {format(new Date(c.end_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                    {stats && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {stats.sent} enviados · {stats.pending} pendentes · {stats.error} erros · {stats.total} total
                      </span>
                    )}
                    {!stats && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" /> Aguardando processamento
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </AppLayout>
  );
}
