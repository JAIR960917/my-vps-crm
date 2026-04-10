import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Check, Eye } from "lucide-react";

type Profile = { user_id: string; full_name: string; email?: string };
type Company = { id: string; name: string };

type FormField = {
  id: string;
  label: string;
  field_type: string;
  options: string[] | null;
  position: number;
  is_required: boolean;
  parent_field_id: string | null;
  parent_trigger_value: string | null;
  status_mapping: Record<string, string> | null;
  date_status_ranges: { ranges: { max_years: number; status_key: string }[]; above_all: string; no_answer: string } | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
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
  canReassign?: boolean;
  onSubmit: (e: React.FormEvent) => void;
  statusOptions: string[];
  statusLabels: Record<string, string>;
};

export default function LeadFormDialog({
  open, onOpenChange, profiles, companies, currentUserName,
  formData, setFormData, formStatus, setFormStatus, formAssigned,
  setFormAssigned, saving, isEditing, canReassign, onSubmit, statusOptions, statusLabels,
}: Props) {
  const [fields, setFields] = useState<FormField[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (open) {
      setShowPreview(false);
      supabase
        .from("crm_form_fields")
        .select("*")
        .order("position")
        .then(({ data }) => setFields((data || []) as unknown as FormField[]));
    }
  }, [open]);

  const set = (key: string, val: any) => setFormData({ ...formData, [key]: val });

  const toggleArray = (key: string, item: string) => {
    const arr: string[] = formData[key] || [];
    set(key, arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]);
  };

  const isFieldVisible = (field: FormField): boolean => {
    if (!field.parent_field_id) return true;
    const parent = fields.find((f) => f.id === field.parent_field_id);
    if (!parent) return false;
    if (!isFieldVisible(parent)) return false;
    if (!field.parent_trigger_value) return true;
    const parentValue = formData[`field_${parent.id}`];
    let triggerValues: string[];
    try {
      const parsed = JSON.parse(field.parent_trigger_value);
      triggerValues = Array.isArray(parsed) ? parsed : [field.parent_trigger_value];
    } catch {
      triggerValues = [field.parent_trigger_value];
    }
    if (Array.isArray(parentValue)) {
      return parentValue.some((v: string) => triggerValues.includes(v));
    }
    return triggerValues.includes(parentValue);
  };

  const renderFormField = (field: FormField) => {
    if (!isFieldVisible(field)) return null;
    const fieldKey = `field_${field.id}`;
    const value = formData[fieldKey] || "";

    return (
      <div key={field.id} className={`space-y-2 ${field.parent_field_id ? "ml-4 pl-3 border-l-2 border-primary/20" : ""}`}>
        <Label>
          {field.label}
          {field.is_required && <span className="text-destructive ml-1">*</span>}
        </Label>

        {field.field_type === "select" && field.options && (
          <Select value={value} onValueChange={(v) => set(fieldKey, v)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {field.options.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {field.field_type === "checkbox_group" && field.options && (
          <div className="flex flex-wrap gap-2">
            {field.options.map((opt) => {
              const arr: string[] = formData[fieldKey] || [];
              const checked = arr.includes(opt);
              return (
                <label
                  key={opt}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm cursor-pointer transition-colors ${
                    checked ? "bg-primary/10 border-primary text-primary" : "bg-muted/50 border-border text-foreground hover:bg-muted"
                  }`}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggleArray(fieldKey, opt)} className="h-3.5 w-3.5" />
                  {opt}
                </label>
              );
            })}
          </div>
        )}

        {field.field_type === "textarea" && (
          <Textarea value={value} onChange={(e) => set(fieldKey, e.target.value)} rows={3} />
        )}

        {["text", "number", "date", "email"].includes(field.field_type) && (
          <Input
            type={field.field_type}
            value={value}
            onChange={(e) => set(fieldKey, e.target.value)}
            required={field.is_required}
          />
        )}
      </div>
    );
  };

  const rootFields = fields.filter((f) => !f.parent_field_id).sort((a, b) => a.position - b.position);

  const renderFieldTree = (field: FormField): React.ReactNode => {
    const children = fields
      .filter((f) => f.parent_field_id === field.id)
      .sort((a, b) => a.position - b.position);

    return (
      <div key={field.id}>
        {renderFormField(field)}
        {children.map((child) => renderFieldTree(child))}
      </div>
    );
  };

  const hasMappingField = fields.some(f => (f.status_mapping && Object.keys(f.status_mapping).length > 0) || f.date_status_ranges);

  // Get visible fields with their answers for the preview
  const getVisibleAnswers = () => {
    const answers: { label: string; value: string }[] = [];
    const processField = (field: FormField) => {
      if (!isFieldVisible(field)) return;
      const fieldKey = `field_${field.id}`;
      const raw = formData[fieldKey];
      let display = "";
      if (Array.isArray(raw)) {
        display = raw.length > 0 ? raw.join(", ") : "—";
      } else {
        display = raw ? String(raw) : "—";
      }
      answers.push({ label: field.label, value: display });
      // Process children
      fields
        .filter((f) => f.parent_field_id === field.id)
        .sort((a, b) => a.position - b.position)
        .forEach(processField);
    };
    rootFields.forEach(processField);
    return answers;
  };

  const handlePreview = () => setShowPreview(true);
  const handleBackToForm = () => setShowPreview(false);

  const handleConfirmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(e);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {showPreview
              ? "📋 Revisão das Respostas"
              : isEditing ? "Editar Lead" : "Novo Lead"}
          </DialogTitle>
        </DialogHeader>

        {showPreview ? (
          /* ====== PREVIEW STEP ====== */
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Confira as respostas antes de salvar o lead:
            </p>

            <div className="rounded-lg border bg-muted/30 divide-y divide-border">
              {/* Fixed info */}
              <div className="flex justify-between items-center px-4 py-2.5">
                <span className="text-sm font-medium text-muted-foreground">Empresa</span>
                <span className="text-sm text-foreground font-medium">
                  {companies.length > 0 ? companies.map(c => c.name).join(", ") : "—"}
                </span>
              </div>
              <div className="flex justify-between items-center px-4 py-2.5">
                <span className="text-sm font-medium text-muted-foreground">Vendedor</span>
                <span className="text-sm text-foreground font-medium">{currentUserName || "—"}</span>
              </div>
              {(isEditing || !hasMappingField) && (
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-sm font-medium text-muted-foreground">Coluna</span>
                  <span className="text-sm text-foreground font-medium">{statusLabels[formStatus] || formStatus}</span>
                </div>
              )}

              {/* Dynamic field answers */}
              {getVisibleAnswers().map((item, i) => (
                <div key={i} className="flex justify-between items-start px-4 py-2.5 gap-4">
                  <span className="text-sm font-medium text-muted-foreground shrink-0">{item.label}</span>
                  <span className="text-sm text-foreground font-medium text-right">{item.value}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={handleBackToForm}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar e Editar
              </Button>
              <Button type="button" className="flex-1" disabled={saving} onClick={handleConfirmSubmit}>
                {saving ? "Salvando..." : <><Check className="h-4 w-4 mr-1" /> Confirmar</>}
              </Button>
            </div>
          </div>
        ) : (
          /* ====== FORM STEP ====== */
          <form onSubmit={(e) => { e.preventDefault(); if (!isEditing && fields.length > 0) { handlePreview(); } else { onSubmit(e); } }} className="space-y-4">
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Input value={companies.length > 0 ? companies.map(c => c.name).join(", ") : "Nenhuma empresa"} readOnly className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Vendedor Responsável</Label>
              <Input value={currentUserName || "—"} readOnly className="bg-muted" />
            </div>

            {(isEditing || !hasMappingField) && (
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
            )}
            {!isEditing && hasMappingField && (
              <p className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
                ℹ️ A coluna será definida automaticamente com base nas respostas.
              </p>
            )}

            {isEditing && canReassign && (
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

            {rootFields.map((field) => renderFieldTree(field))}

            {fields.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma pergunta configurada. Vá em "Formulário" no menu para criar perguntas.
              </p>
            )}

            <Button type="submit" className="w-full" disabled={saving}>
              {saving
                ? "Salvando..."
                : isEditing
                  ? "Atualizar"
                  : fields.length > 0
                    ? <><Eye className="h-4 w-4 mr-1" /> Revisar Respostas</>
                    : "Enviar"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
