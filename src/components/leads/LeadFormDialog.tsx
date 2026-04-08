import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

type CrmColumn = {
  id: string; name: string; field_key: string; field_type: string;
  options: any; position: number; is_required: boolean;
};
type Profile = { user_id: string; full_name: string; email?: string };
type Company = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  columns: CrmColumn[];
  profiles: Profile[];
  companies: Company[];
  currentUserName: string;
  formData: Record<string, any>;
  setFormData: (d: Record<string, any>) => void;
  formStatus: string;
  setFormStatus: (s: string) => void;
  formAssigned: string;
  setFormAssigned: (s: string) => void;
  saving: boolean;
  isEditing: boolean;
  onSubmit: (e: React.FormEvent) => void;
  statusOptions: string[];
  statusLabels: Record<string, string>;
};

const CAPTACAO_OPTIONS = [
  "Ação Adam", "Empresas", "Escolas", "PAP",
  "Redes Sociais Orgânico", "Recomendação/Indicação",
  "Sorteios", "Tráfego Pago", "Lead avulso",
];

const SINTOMAS = [
  "Dor de cabeça", "Ardência", "Coceira", "Dor no olho",
  "Olho inflamado", "Olho remelando", "Excesso de claridade",
  "Lacrimejamento", "Dificuldade perto", "Dificuldade longe",
  "Vista cansada", "Muito tempo de tela",
];

const DOENCAS = [
  "Hipertensão", "Diabetes", "Glaucoma", "Catarata", "Pterígio",
];

const EXAME_VISTA_OPTIONS = ["Sim", "Não"];
const OCULOS_GRAU_OPTIONS = ["Sim", "Não", "Usa lentes", "Não, mas já usou"];
const PROBLEMAS_OCULOS_OPTIONS = [
  "Já comprou um óculos e não gostou",
  "Já comprou um óculos e não se adaptou",
  "Óculos quebrou e não teve assistência",
];
const NOTA_VISAO_OPTIONS = Array.from({ length: 11 }, (_, i) => String(i));
const PERCEPCAO_OPTIONS = ["Sim", "Não"];

const TOTAL_STEPS = 4;

export default function LeadFormDialog({
  open, onOpenChange, columns, profiles, companies, currentUserName,
  formData, setFormData, formStatus, setFormStatus, formAssigned,
  setFormAssigned, saving, isEditing, onSubmit, statusOptions, statusLabels,
}: Props) {
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  const set = (key: string, val: any) => setFormData({ ...formData, [key]: val });

  const toggleArray = (key: string, item: string) => {
    const arr: string[] = formData[key] || [];
    set(key, arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]);
  };

  const canNext = () => {
    if (step === 1) return !!formData.forma_captacao && !!formStatus;
    if (step === 2) return !!formData.nome_lead && !!formData.telefone;
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      return;
    }
    onSubmit(e);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="flex items-center justify-center h-8 w-8 rounded-full border-2 border-primary text-xs font-bold text-primary">
              {step}/{TOTAL_STEPS}
            </span>
            {isEditing ? "Editar Lead" : `Página ${step}`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ── STEP 1: Captação + Coluna + Info automática ── */}
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Input value={companies.length > 0 ? companies.map(c => c.name).join(", ") : "Nenhuma empresa"} readOnly className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>Vendedor Responsável</Label>
                <Input value={currentUserName || "—"} readOnly className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>Coluna (Status) <span className="text-destructive">*</span></Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => (
                      <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Forma de Captação do Lead <span className="text-destructive">*</span></Label>
                <Select value={formData.forma_captacao || ""} onValueChange={(v) => set("forma_captacao", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {CAPTACAO_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isEditing && (
                <div className="space-y-2">
                  <Label>Atribuído a</Label>
                  <Select value={formAssigned || "__none__"} onValueChange={(v) => setFormAssigned(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Ninguém" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Ninguém</SelectItem>
                      {profiles.map((p) => (
                        <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          {/* ── STEP 2: Dados pessoais ── */}
          {step === 2 && (
            <>
              <div className="space-y-2">
                <Label>Nome do Lead <span className="text-destructive">*</span></Label>
                <Input value={formData.nome_lead || ""} onChange={(e) => set("nome_lead", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Data de Nascimento</Label>
                <Input type="date" value={formData.data_nascimento || ""} onChange={(e) => set("data_nascimento", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Idade</Label>
                <Input type="number" value={formData.idade || ""} onChange={(e) => set("idade", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Telefone <span className="text-destructive">*</span></Label>
                <Input value={formData.telefone || ""} onChange={(e) => set("telefone", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Cidade-UF em que mora</Label>
                <Input value={formData.cidade_uf || ""} onChange={(e) => set("cidade_uf", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Já fez exame de vista? <span className="text-destructive">*</span></Label>
                <Select value={formData.exame_vista || ""} onValueChange={(v) => set("exame_vista", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {EXAME_VISTA_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formData.exame_vista === "Sim" && (
                <div className="space-y-2">
                  <Label>Quando fez o último exame de vista?</Label>
                  <Input value={formData.ultimo_exame || ""} onChange={(e) => set("ultimo_exame", e.target.value)} />
                </div>
              )}
              <div className="space-y-2">
                <Label>Utiliza óculos de grau? <span className="text-destructive">*</span></Label>
                <Select value={formData.oculos_grau || ""} onValueChange={(v) => set("oculos_grau", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {OCULOS_GRAU_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Dynamic CRM columns */}
              {columns.map((col) => (
                <div key={col.id} className="space-y-2">
                  <Label>{col.name}{col.is_required && <span className="text-destructive"> *</span>}</Label>
                  {col.field_type === "select" && Array.isArray(col.options) ? (
                    <Select value={formData[col.field_key] || ""} onValueChange={(v) => set(col.field_key, v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {(col.options as string[]).map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={col.field_type === "number" ? "number" : col.field_type === "date" ? "date" : col.field_type === "email" ? "email" : "text"}
                      value={formData[col.field_key] || ""}
                      onChange={(e) => set(col.field_key, e.target.value)}
                      required={col.is_required}
                    />
                  )}
                </div>
              ))}
            </>
          )}

          {/* ── STEP 3: Sintomas e Doenças ── */}
          {step === 3 && (
            <>
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-muted-foreground">Sintomas</legend>
                <div className="flex flex-wrap gap-2">
                  {SINTOMAS.map((s) => {
                    const checked = (formData.sintomas || []).includes(s);
                    return (
                      <label
                        key={s}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm cursor-pointer transition-colors ${
                          checked ? "bg-primary/10 border-primary text-primary" : "bg-muted/50 border-border text-foreground hover:bg-muted"
                        }`}
                      >
                        <Checkbox checked={checked} onCheckedChange={() => toggleArray("sintomas", s)} className="h-3.5 w-3.5" />
                        {s}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-muted-foreground">Doenças</legend>
                <div className="flex flex-wrap gap-2">
                  {DOENCAS.map((d) => {
                    const checked = (formData.doencas || []).includes(d);
                    return (
                      <label
                        key={d}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm cursor-pointer transition-colors ${
                          checked ? "bg-primary/10 border-primary text-primary" : "bg-muted/50 border-border text-foreground hover:bg-muted"
                        }`}
                      >
                        <Checkbox checked={checked} onCheckedChange={() => toggleArray("doencas", d)} className="h-3.5 w-3.5" />
                        {d}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </>
          )}

          {/* ── STEP 4: Observações finais ── */}
          {step === 4 && (
            <>
              <div className="space-y-2">
                <Label>Observação das dores</Label>
                <Textarea value={formData.observacao_dores || ""} onChange={(e) => set("observacao_dores", e.target.value)} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Nota da sua visão de 0 a 10</Label>
                <Select value={formData.nota_visao || ""} onValueChange={(v) => set("nota_visao", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {NOTA_VISAO_OPTIONS.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Já teve algum desses 3 problemas com óculos?</Label>
                <Select value={formData.problemas_oculos || ""} onValueChange={(v) => set("problemas_oculos", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {PROBLEMAS_OCULOS_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Já tem a percepção da dificuldade?</Label>
                <Select value={formData.percepcao_dificuldade || ""} onValueChange={(v) => set("percepcao_dificuldade", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {PERCEPCAO_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* ── Navigation buttons ── */}
          <div className="flex gap-2 pt-2">
            {step > 1 && (
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(step - 1)}>
                Voltar
              </Button>
            )}
            <Button type="submit" className="flex-1" disabled={saving || !canNext()}>
              {step < TOTAL_STEPS
                ? "Próximo"
                : saving
                  ? "Salvando..."
                  : isEditing
                    ? "Atualizar"
                    : "Enviar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
