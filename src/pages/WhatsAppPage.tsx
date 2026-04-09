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
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { MessageSquare, Send, Trash2, Clock, CheckCircle2, XCircle, Plus } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type ScheduledMessage = {
  id: string;
  lead_id: string | null;
  phone: string;
  message: string;
  scheduled_at: string;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  created_by: string;
  created_at: string;
};

type Lead = {
  id: string;
  data: Record<string, any>;
  assigned_to: string | null;
};

type FormField = {
  id: string;
  label: string;
  is_name_field: boolean;
  is_phone_field: boolean;
};

export default function WhatsAppPage() {
  const { user, isAdmin, isGerente } = useAuth();
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [selectedLead, setSelectedLead] = useState<string>("");
  const [phone, setPhone] = useState("");
  const [messageText, setMessageText] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [msgsRes, leadsRes, fieldsRes] = await Promise.all([
      supabase
        .from("scheduled_whatsapp_messages")
        .select("*")
        .order("scheduled_at", { ascending: true }),
      supabase.from("crm_leads").select("id, data, assigned_to"),
      supabase.from("crm_form_fields").select("id, label, is_name_field, is_phone_field"),
    ]);
    setMessages((msgsRes.data || []) as ScheduledMessage[]);
    setLeads((leadsRes.data || []) as Lead[]);
    setFormFields((fieldsRes.data || []) as FormField[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getLeadName = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return "Lead removido";
    const data = typeof lead.data === "object" ? (lead.data as Record<string, any>) : {};
    const nameField = formFields.find((f) => f.is_name_field);
    if (nameField) return data[`field_${nameField.id}`] || "Sem nome";
    return data.nome_lead || "Sem nome";
  };

  const getLeadPhone = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return "";
    const data = typeof lead.data === "object" ? (lead.data as Record<string, any>) : {};
    const phoneField = formFields.find((f) => f.is_phone_field);
    if (phoneField) return data[`field_${phoneField.id}`] || "";
    return data.telefone || "";
  };

  const handleLeadSelect = (leadId: string) => {
    setSelectedLead(leadId);
    const leadPhone = getLeadPhone(leadId);
    if (leadPhone) setPhone(leadPhone);
  };

  const handleSubmit = async () => {
    if (!phone.trim() || !messageText.trim() || !scheduledDate || !scheduledTime) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (!user) return;

    setSaving(true);
    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();

    const { error } = await supabase.from("scheduled_whatsapp_messages").insert({
      lead_id: selectedLead || null,
      phone: phone.trim(),
      message: messageText.trim(),
      scheduled_at: scheduledAt,
      created_by: user.id,
    });

    if (error) {
      toast.error("Erro ao agendar mensagem");
      console.error(error);
    } else {
      toast.success("Mensagem agendada com sucesso!");
      setShowForm(false);
      setSelectedLead("");
      setPhone("");
      setMessageText("");
      setScheduledDate("");
      setScheduledTime("");
      fetchData();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("scheduled_whatsapp_messages").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao remover mensagem");
    } else {
      toast.success("Mensagem removida");
      fetchData();
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-amber-500 border-amber-500"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
      case "sent":
        return <Badge variant="outline" className="text-emerald-500 border-emerald-500"><CheckCircle2 className="h-3 w-3 mr-1" />Enviado</Badge>;
      case "error":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Erro</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const canDelete = (msg: ScheduledMessage) => {
    if (isAdmin) return true;
    if (isGerente) return true;
    return msg.created_by === user?.id && msg.status === "pending";
  };

  return (
    <AppLayout>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" />
            WhatsApp Agendado
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Agende mensagens automáticas para enviar via WhatsApp
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Nova Mensagem
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-lg border bg-card p-4 mb-6 space-y-4">
          <h3 className="font-semibold text-sm">Agendar nova mensagem</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Lead (opcional)</Label>
              <Select value={selectedLead} onValueChange={handleLeadSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um lead..." />
                </SelectTrigger>
                <SelectContent>
                  {leads.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {getLeadName(lead.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Telefone *</Label>
              <Input
                placeholder="+5511999999999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">Formato internacional: +55DDD...</p>
            </div>

            <div className="space-y-2">
              <Label>Data *</Label>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Horário *</Label>
              <Input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Mensagem *</Label>
            <Textarea
              placeholder="Digite a mensagem que será enviada..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={saving}>
              <Send className="h-4 w-4 mr-1" />
              {saving ? "Agendando..." : "Agendar Envio"}
            </Button>
          </div>
        </div>
      )}

      {/* Messages list */}
      <ScrollArea className="flex-1">
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Carregando...</p>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Nenhuma mensagem agendada</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className="rounded-lg border bg-card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">
                        {msg.lead_id ? getLeadName(msg.lead_id) : "Contato avulso"}
                      </span>
                      {statusBadge(msg.status)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      📱 {msg.phone}
                    </p>
                  </div>
                  {canDelete(msg) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => handleDelete(msg.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>

                <p className="text-sm bg-muted/50 rounded-md p-2 whitespace-pre-wrap">{msg.message}</p>

                <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                  <span>
                    📅 Agendado: {format(new Date(msg.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                  {msg.sent_at && (
                    <span>
                      ✅ Enviado: {format(new Date(msg.sent_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  )}
                  {msg.error_message && (
                    <span className="text-destructive">❌ {msg.error_message}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </AppLayout>
  );
}
