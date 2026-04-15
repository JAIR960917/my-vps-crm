import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarCheck, Plus, Pencil, Trash2, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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
  nome: string;
  telefone: string;
  idade: string;
};

type Profile = { user_id: string; full_name: string };

const CONFIRMACAO_OPTIONS = ["Pendente", "Confirmado", "Cancelado"];
const COMPARECIMENTO_OPTIONS = ["Pendente", "Compareceu", "Não Compareceu"];
const VENDA_OPTIONS = ["Pendente", "Vendido", "Não Vendido"];

const CANAIS = [
  "Ligação Leads", "Ligação Renovação", "Loja", "Rede Social", "Ação Adam",
  "Convênios", "PAP", "Reavaliação", "Recomendação", "Teste de Visão Online",
  "Tráfego Pago", "Cortesia",
];
const FORMAS_PAGAMENTO = [
  "Dinheiro", "Cartão de Crédito", "Cartão de Débito", "PIX", "Convênio", "Boleto", "Cortesia",
];

type Company = { id: string; name: string };
type ProfileFull = { user_id: string; full_name: string; company_id: string | null };

export default function AppointmentsPage() {
  const { user, isAdmin } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profilesFull, setProfilesFull] = useState<ProfileFull[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState<Date | undefined>(new Date());
  const [filterCompanyId, setFilterCompanyId] = useState<string>("all");

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [saving, setSaving] = useState(false);
  const [formNome, setFormNome] = useState("");
  const [formTelefone, setFormTelefone] = useState("");
  const [formIdade, setFormIdade] = useState("");
  const [formDate, setFormDate] = useState<Date | undefined>();
  const [formTime, setFormTime] = useState("09:00");
  const [formValor, setFormValor] = useState("");
  const [formPagamento, setFormPagamento] = useState("");
  const [formCanal, setFormCanal] = useState("");

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Sale dialog (when "Vendido" is selected)
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [saleApptId, setSaleApptId] = useState<string | null>(null);
  const [saleValor, setSaleValor] = useState("");
  const [salePagamento, setSalePagamento] = useState("");
  const [saleSaving, setSaleSaving] = useState(false);
  const [saleEntrada, setSaleEntrada] = useState("");

  const fetchAll = async () => {
    setLoading(true);
    let query = supabase.from("crm_appointments").select("*").eq("status", "agendado").order("scheduled_datetime");
    if (filterDate) {
      const dayStart = new Date(filterDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(filterDate);
      dayEnd.setHours(23, 59, 59, 999);
      query = query.gte("scheduled_datetime", dayStart.toISOString()).lte("scheduled_datetime", dayEnd.toISOString());
    }
    const [apptRes, profRes] = await Promise.all([
      query,
      supabase.rpc("get_profile_names"),
    ]);
    setAppointments((apptRes.data || []) as unknown as Appointment[]);
    setProfiles((profRes.data || []) as Profile[]);
    if (isAdmin) {
      const [compRes, profFullRes] = await Promise.all([
        supabase.from("companies").select("id, name").order("name"),
        supabase.from("profiles").select("user_id, full_name, company_id"),
      ]);
      setCompanies((compRes.data || []) as Company[]);
      setProfilesFull((profFullRes.data || []) as ProfileFull[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [filterDate]);

  const filteredAppointments = isAdmin && filterCompanyId !== "all"
    ? appointments.filter((appt) => {
        const prof = profilesFull.find(p => p.user_id === appt.scheduled_by);
        return prof?.company_id === filterCompanyId;
      })
    : appointments;

  const getProfileName = (userId: string) => profiles.find(p => p.user_id === userId)?.full_name || "—";

  const updateField = async (id: string, field: string, value: string) => {
    const appt = appointments.find(a => a.id === id);

    if (field === "comparecimento" && value === "Não Compareceu" && appt) {
      await supabase.from("crm_leads").update({ status: appt.previous_status } as any).eq("id", appt.lead_id);
      await supabase.from("crm_appointments").update({ [field]: value, status: "nao_compareceu" } as any).eq("id", id);
      toast.success("Lead devolvido à coluna original");
      fetchAll();
      return;
    }

    if (field === "venda" && value === "Não Vendido" && appt) {
      await supabase.from("crm_leads").update({ status: appt.previous_status } as any).eq("id", appt.lead_id);
      await supabase.from("crm_appointments").update({ [field]: value, status: "nao_vendido" } as any).eq("id", id);
      toast.success("Lead devolvido à coluna original");
      fetchAll();
      return;
    }

    if (field === "venda" && value === "Vendido") {
      setSaleApptId(id);
      setSaleValor("");
      setSaleEntrada("");
      setSalePagamento("");
      setSaleDialogOpen(true);
      return;
    }

    const { error } = await supabase.from("crm_appointments").update({ [field]: value } as any).eq("id", id);
    if (error) toast.error("Erro ao atualizar");
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  const handleSaleSubmit = async () => {
    if (!saleApptId || !salePagamento || !saleValor) return;
    setSaleSaving(true);
    const appt = appointments.find(a => a.id === saleApptId);
    await supabase.from("crm_appointments").update({
      venda: "Vendido",
      valor_venda: parseFloat(saleValor) || 0,
      valor_entrada: parseFloat(saleEntrada) || 0,
      forma_pagamento_venda: salePagamento,
      status: "vendido",
    } as any).eq("id", saleApptId);
    if (appt?.lead_id) {
      await supabase.from("crm_leads").update({ comprou: true, status: "vendido" } as any).eq("id", appt.lead_id);
    }
    toast.success("Venda registrada! Cliente movido para ativos.");
    setSaleSaving(false);
    setSaleDialogOpen(false);
    setSaleApptId(null);
    fetchAll();
  };

  const openAdd = () => {
    setEditingAppt(null);
    setFormNome(""); setFormTelefone(""); setFormIdade("");
    setFormDate(undefined); setFormTime("09:00");
    setFormValor(""); setFormPagamento(""); setFormCanal("");
    setDialogOpen(true);
  };

  const openEdit = (appt: Appointment) => {
    setEditingAppt(appt);
    setFormNome(appt.nome); setFormTelefone(appt.telefone); setFormIdade(appt.idade);
    try {
      const dt = new Date(appt.scheduled_datetime);
      setFormDate(dt);
      setFormTime(format(dt, "HH:mm"));
    } catch { setFormDate(undefined); setFormTime("09:00"); }
    setFormValor(String(appt.valor)); setFormPagamento(appt.forma_pagamento); setFormCanal(appt.canal_agendamento);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDate || !formPagamento || !formCanal || !user) return;
    setSaving(true);
    const [h, m] = formTime.split(":").map(Number);
    const dt = new Date(formDate);
    dt.setHours(h, m, 0, 0);

    if (editingAppt) {
      const { error } = await supabase.from("crm_appointments").update({
        nome: formNome, telefone: formTelefone, idade: formIdade,
        scheduled_datetime: dt.toISOString(),
        valor: parseFloat(formValor) || 0,
        forma_pagamento: formPagamento,
        canal_agendamento: formCanal,
      } as any).eq("id", editingAppt.id);
      if (error) toast.error("Erro ao atualizar");
      else toast.success("Agendamento atualizado");
    } else {
      const { error } = await supabase.from("crm_appointments").insert({
        lead_id: null,
        scheduled_by: user.id,
        scheduled_datetime: dt.toISOString(),
        valor: parseFloat(formValor) || 0,
        forma_pagamento: formPagamento,
        canal_agendamento: formCanal,
        nome: formNome, telefone: formTelefone, idade: formIdade,
        previous_status: "manual",
      } as any);
      if (error) toast.error("Erro ao criar agendamento");
      else toast.success("Agendamento criado");
    }
    setSaving(false);
    setDialogOpen(false);
    fetchAll();
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const appt = appointments.find(a => a.id === deleteId);
    // Return lead to original column if it has a real lead_id
    if (appt && appt.lead_id) {
      await supabase.from("crm_leads").update({ status: appt.previous_status } as any).eq("id", appt.lead_id);
    }
    const { error } = await supabase.from("crm_appointments").delete().eq("id", deleteId);
    if (error) toast.error("Erro ao excluir");
    else toast.success("Agendamento excluído");
    setDeleteId(null);
    fetchAll();
  };

  return (
    <AppLayout>
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CalendarCheck className="h-6 w-6 text-primary" />
            <h1 className="text-xl sm:text-2xl font-bold">Agendamentos</h1>
          </div>
          <p className="text-sm text-muted-foreground">{filteredAppointments.length} agendamento(s)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && companies.length > 0 && (
            <Select value={filterCompanyId} onValueChange={setFilterCompanyId}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Todas empresas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas empresas</SelectItem>
                {companies.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !filterDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4 text-destructive" />
                {filterDate ? format(filterDate, "dd/MM/yyyy", { locale: ptBR }) : "Todos os dias"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={filterDate} onSelect={setFilterDate} locale={ptBR} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          {filterDate && (
            <Button variant="ghost" size="sm" onClick={() => setFilterDate(undefined)}>
              Limpar
            </Button>
          )}
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1 h-4 w-4" /> Novo Agendamento
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">Carregando...</p>
      ) : filteredAppointments.length === 0 ? (
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
                <th className="text-left px-3 py-2.5 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredAppointments.map((appt) => {
                let dtFormatted = "—";
                try { dtFormatted = format(new Date(appt.scheduled_datetime), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch {}
                return (
                  <tr key={appt.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{appt.nome || "—"}</td>
                    <td className="px-3 py-2">{appt.telefone || "—"}</td>
                    <td className="px-3 py-2">{appt.idade || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{dtFormatted}</td>
                    <td className="px-3 py-2">{getProfileName(appt.scheduled_by)}</td>
                    <td className="px-3 py-2">R$ {Number(appt.valor).toFixed(2)}</td>
                    <td className="px-3 py-2">{appt.forma_pagamento}</td>
                    <td className="px-3 py-2">{appt.canal_agendamento}</td>
                    <td className="px-3 py-2">
                      <Select value={appt.confirmacao} onValueChange={(v) => updateField(appt.id, "confirmacao", v)}>
                        <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{CONFIRMACAO_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Select value={appt.comparecimento} onValueChange={(v) => updateField(appt.id, "comparecimento", v)}>
                        <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{COMPARECIMENTO_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Select value={appt.venda} onValueChange={(v) => updateField(appt.id, "venda", v)}>
                        <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{VENDA_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        className="border rounded px-2 py-1 text-xs w-[150px] bg-background"
                        defaultValue={appt.resumo}
                        onBlur={(e) => { if (e.target.value !== appt.resumo) updateField(appt.id, "resumo", e.target.value); }}
                        placeholder="Observações..."
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(appt)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(appt.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAppt ? "Editar Agendamento" : "Novo Agendamento"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome <span className="text-destructive">*</span></Label>
              <Input value={formNome} onChange={e => setFormNome(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={formTelefone} onChange={e => setFormTelefone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Idade</Label>
                <Input value={formIdade} onChange={e => setFormIdade(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data <span className="text-destructive">*</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formDate ? format(formDate, "dd/MM/yyyy") : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={formDate} onSelect={setFormDate} locale={ptBR} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>Horário <span className="text-destructive">*</span></Label>
                <Input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Valor (R$) <span className="text-destructive">*</span></Label>
              <Input type="number" step="0.01" min="0" value={formValor} onChange={e => setFormValor(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Forma de Pagamento <span className="text-destructive">*</span></Label>
              <Select value={formPagamento} onValueChange={setFormPagamento}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{FORMAS_PAGAMENTO.map(fp => <SelectItem key={fp} value={fp}>{fp}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Canal de Agendamento <span className="text-destructive">*</span></Label>
              <Select value={formCanal} onValueChange={setFormCanal}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{CANAIS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={saving || !formDate || !formPagamento || !formCanal || !formNome}>
              {saving ? "Salvando..." : editingAppt ? "Atualizar" : "Criar Agendamento"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
            <AlertDialogDescription>O lead será devolvido à coluna original.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sale Dialog */}
      <Dialog open={saleDialogOpen} onOpenChange={(open) => { if (!open) { setSaleDialogOpen(false); setSaleApptId(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Venda</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Valor Total da Venda (R$) <span className="text-destructive">*</span></Label>
              <Input type="number" step="0.01" min="0" value={saleValor} onChange={(e) => setSaleValor(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Valor da Entrada (R$)</Label>
              <Input type="number" step="0.01" min="0" value={saleEntrada} onChange={(e) => setSaleEntrada(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Forma de Pagamento <span className="text-destructive">*</span></Label>
              <Select value={salePagamento} onValueChange={setSalePagamento}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGAMENTO.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" disabled={saleSaving || !saleValor || !salePagamento} onClick={handleSaleSubmit}>
              {saleSaving ? "Salvando..." : "Confirmar Venda"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
