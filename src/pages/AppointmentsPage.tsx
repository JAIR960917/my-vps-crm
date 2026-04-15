import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarCheck, ArrowLeft } from "lucide-react";

type Appointment = {
  id: string;
  lead_id: string;
  scheduled_by: string;
  scheduled_datetime: string;
  valor: number;
  forma_pagamento: string;
  canal_agendamento: string;
  confirmacao: string;
  comparecimento: string;
  venda: string;
  resumo: string;
  previous_status: string;
  status: string;
  created_at: string;
};

type LeadData = {
  id: string;
  data: Record<string, any>;
};

type Profile = { user_id: string; full_name: string };
type FormFieldInfo = { id: string; label: string; is_name_field: boolean; is_phone_field: boolean };

const CONFIRMACAO_OPTIONS = ["Pendente", "Confirmado", "Cancelado"];
const COMPARECIMENTO_OPTIONS = ["Pendente", "Compareceu", "Não Compareceu"];
const VENDA_OPTIONS = ["Pendente", "Vendido", "Não Vendido"];

export default function AppointmentsPage() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [leads, setLeads] = useState<LeadData[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [formFields, setFormFields] = useState<FormFieldInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: appts }, { data: lds }, { data: profs }, { data: ff }] = await Promise.all([
      supabase.from("crm_appointments").select("*").eq("status", "agendado").order("scheduled_datetime"),
      supabase.from("crm_leads").select("id, data"),
      supabase.rpc("get_profile_names"),
      supabase.from("crm_form_fields").select("id, label, is_name_field, is_phone_field").order("position"),
    ]);
    setAppointments((appts || []) as unknown as Appointment[]);
    setLeads((lds || []) as unknown as LeadData[]);
    setProfiles((profs || []) as Profile[]);
    setFormFields((ff || []) as unknown as FormFieldInfo[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const getLeadInfo = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return { name: "—", phone: "—", idade: "—" };
    const data = typeof lead.data === "object" ? lead.data as Record<string, any> : {};
    const nameField = formFields.find(f => f.is_name_field);
    const phoneField = formFields.find(f => f.is_phone_field);
    const name = nameField ? data[`field_${nameField.id}`] : data.nome_lead;
    const phone = phoneField ? data[`field_${phoneField.id}`] : data.telefone;
    // Try to find idade field
    const idadeField = formFields.find(f => f.label.toLowerCase().includes("idade"));
    const idade = idadeField ? data[`field_${idadeField.id}`] : "—";
    return { name: name || "—", phone: phone || "—", idade: idade || "—" };
  };

  const getProfileName = (userId: string) => {
    const p = profiles.find(pr => pr.user_id === userId);
    return p?.full_name || "—";
  };

  const updateField = async (id: string, field: string, value: string) => {
    const appt = appointments.find(a => a.id === id);
    
    // If comparecimento = "Não Compareceu", return lead to original column
    if (field === "comparecimento" && value === "Não Compareceu" && appt) {
      const { error: leadErr } = await supabase.from("crm_leads").update({
        status: appt.previous_status,
      }).eq("id", appt.lead_id);
      
      const { error } = await supabase.from("crm_appointments").update({
        [field]: value,
        status: "nao_compareceu",
      } as any).eq("id", id);
      
      if (error || leadErr) toast.error("Erro ao atualizar");
      else toast.success("Lead devolvido à coluna original");
      fetchAll();
      return;
    }

    // If comparecimento = "Compareceu" and venda = "Vendido", mark as active client
    const { error } = await supabase.from("crm_appointments").update({
      [field]: value,
    } as any).eq("id", id);
    if (error) toast.error("Erro ao atualizar");
    else toast.success("Atualizado");
    
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  return (
    <AppLayout>
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <CalendarCheck className="h-6 w-6 text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold">Agendamentos</h1>
        </div>
        <p className="text-sm text-muted-foreground">{appointments.length} agendamento(s)</p>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">Carregando...</p>
      ) : appointments.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">Nenhum agendamento encontrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/70 border-b">
                <th className="text-left px-3 py-2.5 font-medium">Nome</th>
                <th className="text-left px-3 py-2.5 font-medium">Telefone</th>
                <th className="text-left px-3 py-2.5 font-medium">Idade</th>
                <th className="text-left px-3 py-2.5 font-medium">Horário</th>
                <th className="text-left px-3 py-2.5 font-medium">Agendado por</th>
                <th className="text-left px-3 py-2.5 font-medium">Valor</th>
                <th className="text-left px-3 py-2.5 font-medium">Forma de Pagamento</th>
                <th className="text-left px-3 py-2.5 font-medium">Canal de Agendamento</th>
                <th className="text-left px-3 py-2.5 font-medium">Confirmação</th>
                <th className="text-left px-3 py-2.5 font-medium">Comparecimento</th>
                <th className="text-left px-3 py-2.5 font-medium">Venda</th>
                <th className="text-left px-3 py-2.5 font-medium">Resumo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {appointments.map((appt) => {
                const info = getLeadInfo(appt.lead_id);
                let dtFormatted = "—";
                try { dtFormatted = format(new Date(appt.scheduled_datetime), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch {}
                
                return (
                  <tr key={appt.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{info.name}</td>
                    <td className="px-3 py-2">{info.phone}</td>
                    <td className="px-3 py-2">{info.idade}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{dtFormatted}</td>
                    <td className="px-3 py-2">{getProfileName(appt.scheduled_by)}</td>
                    <td className="px-3 py-2">R$ {Number(appt.valor).toFixed(2)}</td>
                    <td className="px-3 py-2">{appt.forma_pagamento}</td>
                    <td className="px-3 py-2">{appt.canal_agendamento}</td>
                    <td className="px-3 py-2">
                      <Select value={appt.confirmacao} onValueChange={(v) => updateField(appt.id, "confirmacao", v)}>
                        <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CONFIRMACAO_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Select value={appt.comparecimento} onValueChange={(v) => updateField(appt.id, "comparecimento", v)}>
                        <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {COMPARECIMENTO_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Select value={appt.venda} onValueChange={(v) => updateField(appt.id, "venda", v)}>
                        <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {VENDA_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        className="border rounded px-2 py-1 text-xs w-[150px] bg-background"
                        defaultValue={appt.resumo}
                        onBlur={(e) => {
                          if (e.target.value !== appt.resumo) {
                            updateField(appt.id, "resumo", e.target.value);
                          }
                        }}
                        placeholder="Observações..."
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
