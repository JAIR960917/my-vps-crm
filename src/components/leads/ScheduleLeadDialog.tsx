import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

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
    valor: number;
    forma_pagamento: string;
    canal_agendamento: string;
  }) => void;
};

export default function ScheduleLeadDialog({ open, onOpenChange, leadName, leadPhone, saving, onSubmit }: Props) {
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState("09:00");
  const [valor, setValor] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [canal, setCanal] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !formaPagamento || !canal) return;
    
    const [h, m] = time.split(":").map(Number);
    const dt = new Date(date);
    dt.setHours(h, m, 0, 0);

    onSubmit({
      scheduled_datetime: dt.toISOString(),
      valor: parseFloat(valor) || 0,
      forma_pagamento: formaPagamento,
      canal_agendamento: canal,
    });

    // Reset
    setDate(undefined);
    setTime("09:00");
    setValor("");
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
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4 text-destructive" />
                  {date ? format(date, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={setDate} locale={ptBR} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Horário <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive pointer-events-none" />
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className="pl-10" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Valor da Consulta (R$) <span className="text-destructive">*</span></Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              required
            />
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

          <Button type="submit" className="w-full" disabled={saving || !date || !formaPagamento || !canal}>
            {saving ? "Agendando..." : "Confirmar Agendamento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
