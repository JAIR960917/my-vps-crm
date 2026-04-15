import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { UserCheck } from "lucide-react";

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
  created_at: string;
};

type LeadData = { id: string; data: Record<string, any> };
type Profile = { user_id: string; full_name: string };
type FormFieldInfo = { id: string; label: string; is_name_field: boolean; is_phone_field: boolean };

export default function ActiveClientsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [leads, setLeads] = useState<LeadData[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [formFields, setFormFields] = useState<FormFieldInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const [{ data: appts }, { data: lds }, { data: profs }, { data: ff }] = await Promise.all([
        supabase.from("crm_appointments").select("*").eq("comparecimento", "Compareceu").eq("venda", "Vendido").order("scheduled_datetime", { ascending: false }),
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
    fetchAll();
  }, []);

  const getLeadInfo = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return { name: "—", phone: "—" };
    const data = typeof lead.data === "object" ? lead.data as Record<string, any> : {};
    const nameField = formFields.find(f => f.is_name_field);
    const phoneField = formFields.find(f => f.is_phone_field);
    return {
      name: (nameField ? data[`field_${nameField.id}`] : data.nome_lead) || "—",
      phone: (phoneField ? data[`field_${phoneField.id}`] : data.telefone) || "—",
    };
  };

  const getProfileName = (userId: string) => profiles.find(p => p.user_id === userId)?.full_name || "—";

  return (
    <AppLayout>
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <UserCheck className="h-6 w-6 text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold">Clientes Ativos</h1>
        </div>
        <p className="text-sm text-muted-foreground">{appointments.length} cliente(s) ativo(s)</p>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">Carregando...</p>
      ) : appointments.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">Nenhum cliente ativo encontrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/70 border-b">
                <th className="text-left px-3 py-2.5 font-medium">Nome</th>
                <th className="text-left px-3 py-2.5 font-medium">Telefone</th>
                <th className="text-left px-3 py-2.5 font-medium">Data da Consulta</th>
                <th className="text-left px-3 py-2.5 font-medium">Vendedor</th>
                <th className="text-left px-3 py-2.5 font-medium">Valor</th>
                <th className="text-left px-3 py-2.5 font-medium">Forma de Pagamento</th>
                <th className="text-left px-3 py-2.5 font-medium">Canal</th>
                <th className="text-left px-3 py-2.5 font-medium">Resumo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {appointments.map((appt) => {
                const info = getLeadInfo(appt.lead_id);
                let dtFormatted = "—";
                try { dtFormatted = format(new Date(appt.scheduled_datetime), "dd/MM/yyyy", { locale: ptBR }); } catch {}
                return (
                  <tr key={appt.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{info.name}</td>
                    <td className="px-3 py-2">{info.phone}</td>
                    <td className="px-3 py-2">{dtFormatted}</td>
                    <td className="px-3 py-2">{getProfileName(appt.scheduled_by)}</td>
                    <td className="px-3 py-2">R$ {Number(appt.valor).toFixed(2)}</td>
                    <td className="px-3 py-2">{appt.forma_pagamento}</td>
                    <td className="px-3 py-2">{appt.canal_agendamento}</td>
                    <td className="px-3 py-2">{appt.resumo || "—"}</td>
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
