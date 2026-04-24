import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Clock } from "lucide-react";

const CANAIS_AGENDAMENTO = [
  "Ligação Leads",
  "Ligação Renovação",
  "Loja",
  "Rede Social",
  "Ação Adam",
  "Convênios",
  "PAP",
  "Reavaliação",
  "Recomendação",
  "Teste de Visão Online",
  "Tráfego Pago",
  "Cortesia",
];

const FORMAS_PAGAMENTO = [
  "Dinheiro",
  "Cartão de Crédito",
  "Cartão de Débito",
  "PIX",
  "Convênio",
  "Boleto",
  "Cortesia",
];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadName: string;
  leadPhone: string;
  saving: boolean;
  onSubmit: (data: {
    scheduled_datetime: string;
    forma_pagamento: string;
    canal_agendamento: string;
  }) => void;
};

export default function ScheduleLeadDialog({ open, onOpenChange, leadName, leadPhone, saving, onSubmit }: Props) {
  const [dateStr, setDateStr] = useState("");
  const [time, setTime] = useState("09:00");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [canal, setCanal] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dateStr || !formaPagamento || !canal) return;

    const [y, mo, d] = dateStr.split("-").map(Number);
    const [h, m] = time.split(":").map(Number);
    const dt = new Date(y, mo - 1, d, h, m, 0, 0);

    onSubmit({
      scheduled_datetime: dt.toISOString(),
      forma_pagamento: formaPagamento,
      canal_agendamento: canal,
    });

    // Reset
    setDateStr("");
    setTime("09:00");
    setFormaPagamento("");
    setCanal("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>📅 Agendar Consulta</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <p className="text-sm"><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{leadName}</span></p>
            {leadPhone && <p className="text-sm"><span className="text-muted-foreground">Telefone:</span> <span className="font-medium">{leadPhone}</span></p>}
          </div>

          <div className="space-y-2">
            <Label>Data do Agendamento <span className="text-destructive">*</span></Label>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive pointer-events-none" />
              <Input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                required
                onClick={(e) => (e.currentTarget as any).showPicker?.()}
                className="pl-10 cursor-pointer"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Horário <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive pointer-events-none" />
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className="pl-10 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-8 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer" />
              <Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive pointer-events-none" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Forma de Pagamento <span className="text-destructive">*</span></Label>
            <Select value={formaPagamento} onValueChange={setFormaPagamento} required>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {FORMAS_PAGAMENTO.map((fp) => (
                  <SelectItem key={fp} value={fp}>{fp}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Canal de Agendamento <span className="text-destructive">*</span></Label>
            <Select value={canal} onValueChange={setCanal} required>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {CANAIS_AGENDAMENTO.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" className="w-full" disabled={saving || !dateStr || !formaPagamento || !canal}>
            {saving ? "Agendando..." : "Confirmar Agendamento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
