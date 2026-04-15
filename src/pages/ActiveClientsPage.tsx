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
import { UserCheck, Plus, Pencil, Trash2, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Appointment = {
  id: string;
  lead_id: string;
  scheduled_by: string;
  scheduled_datetime: string;
  valor: number;
  forma_pagamento: string;
  canal_agendamento: string;
  comparecimento: string;
  venda: string;
  resumo: string;
  nome: string;
  telefone: string;
  idade: string;
};

type Profile = { user_id: string; full_name: string };

const FORMAS_PAGAMENTO = [
  "Dinheiro", "Cartão de Crédito", "Cartão de Débito", "PIX", "Convênio", "Boleto", "Cortesia",
];
const CANAIS = [
  "Ligação Leads", "Ligação Renovação", "Loja", "Rede Social", "Ação Adam",
  "Convênios", "PAP", "Reavaliação", "Recomendação", "Teste de Visão Online",
  "Tráfego Pago", "Cortesia",
];

export default function ActiveClientsPage() {
  const { user, isAdmin } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Add/Edit
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
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: appts }, { data: profs }] = await Promise.all([
      supabase.from("crm_appointments").select("*").eq("comparecimento", "Compareceu").eq("venda", "Vendido").order("scheduled_datetime", { ascending: false }),
      supabase.rpc("get_profile_names"),
    ]);
    setAppointments((appts || []) as unknown as Appointment[]);
    setProfiles((profs || []) as Profile[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const getProfileName = (userId: string) => profiles.find(p => p.user_id === userId)?.full_name || "—";

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
    try { const dt = new Date(appt.scheduled_datetime); setFormDate(dt); setFormTime(format(dt, "HH:mm")); } catch { setFormDate(undefined); setFormTime("09:00"); }
    setFormValor(String(appt.valor)); setFormPagamento(appt.forma_pagamento); setFormCanal(appt.canal_agendamento);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDate || !formPagamento || !formCanal || !user) return;
    setSaving(true);
    const [h, m] = formTime.split(":").map(Number);
    const dt = new Date(formDate); dt.setHours(h, m, 0, 0);

    if (editingAppt) {
      const { error } = await supabase.from("crm_appointments").update({
        nome: formNome, telefone: formTelefone, idade: formIdade,
        scheduled_datetime: dt.toISOString(), valor: parseFloat(formValor) || 0,
        forma_pagamento: formPagamento, canal_agendamento: formCanal,
      } as any).eq("id", editingAppt.id);
      if (error) toast.error("Erro ao atualizar"); else toast.success("Atualizado");
    } else {
      const { error } = await supabase.from("crm_appointments").insert({
        lead_id: "00000000-0000-0000-0000-000000000000",
        scheduled_by: user.id, scheduled_datetime: dt.toISOString(),
        valor: parseFloat(formValor) || 0, forma_pagamento: formPagamento,
        canal_agendamento: formCanal, nome: formNome, telefone: formTelefone, idade: formIdade,
        previous_status: "manual", comparecimento: "Compareceu", venda: "Vendido",
      } as any);
      if (error) toast.error("Erro ao criar"); else toast.success("Cliente adicionado");
    }
    setSaving(false); setDialogOpen(false); fetchAll();
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("crm_appointments").delete().eq("id", deleteId);
    if (error) toast.error("Erro ao excluir"); else toast.success("Excluído");
    setDeleteId(null); fetchAll();
  };

  return (
    <AppLayout>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <UserCheck className="h-6 w-6 text-primary" />
            <h1 className="text-xl sm:text-2xl font-bold">Clientes Ativos</h1>
          </div>
          <p className="text-sm text-muted-foreground">{appointments.length} cliente(s) ativo(s)</p>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-1 h-4 w-4" /> Novo Cliente
        </Button>
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
                <th className="text-left px-3 py-2.5 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {appointments.map((appt) => {
                let dtFormatted = "—";
                try { dtFormatted = format(new Date(appt.scheduled_datetime), "dd/MM/yyyy", { locale: ptBR }); } catch {}
                return (
                  <tr key={appt.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{appt.nome || "—"}</td>
                    <td className="px-3 py-2">{appt.telefone || "—"}</td>
                    <td className="px-3 py-2">{dtFormatted}</td>
                    <td className="px-3 py-2">{getProfileName(appt.scheduled_by)}</td>
                    <td className="px-3 py-2">R$ {Number(appt.valor).toFixed(2)}</td>
                    <td className="px-3 py-2">{appt.forma_pagamento}</td>
                    <td className="px-3 py-2">{appt.canal_agendamento}</td>
                    <td className="px-3 py-2">{appt.resumo || "—"}</td>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingAppt ? "Editar Cliente" : "Novo Cliente Ativo"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5"><Label>Nome <span className="text-destructive">*</span></Label><Input value={formNome} onChange={e => setFormNome(e.target.value)} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Telefone</Label><Input value={formTelefone} onChange={e => setFormTelefone(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Idade</Label><Input value={formIdade} onChange={e => setFormIdade(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data <span className="text-destructive">*</span></Label>
                <Popover><PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />{formDate ? format(formDate, "dd/MM/yyyy") : "Selecionar"}
                  </Button>
                </PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={formDate} onSelect={setFormDate} locale={ptBR} className="p-3 pointer-events-auto" /></PopoverContent></Popover>
              </div>
              <div className="space-y-1.5"><Label>Horário</Label><Input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Valor (R$) <span className="text-destructive">*</span></Label><Input type="number" step="0.01" min="0" value={formValor} onChange={e => setFormValor(e.target.value)} required /></div>
            <div className="space-y-1.5"><Label>Forma de Pagamento <span className="text-destructive">*</span></Label>
              <Select value={formPagamento} onValueChange={setFormPagamento}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{FORMAS_PAGAMENTO.map(fp => <SelectItem key={fp} value={fp}>{fp}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Canal <span className="text-destructive">*</span></Label>
              <Select value={formCanal} onValueChange={setFormCanal}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{CANAIS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <Button type="submit" className="w-full" disabled={saving || !formDate || !formPagamento || !formCanal || !formNome}>
              {saving ? "Salvando..." : editingAppt ? "Atualizar" : "Adicionar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir cliente ativo?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
