import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, WifiOff, ArrowLeft, Check, Eye, CalendarIcon, Clock } from "lucide-react";
import { addToOfflineQueue, syncOfflineQueue, getOfflineQueue, type OfflineAppointmentPayload } from "@/lib/offlineSync";
import { formatPhoneBR } from "@/lib/phoneFormat";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type DateStatusRange = { max_years: number; status_key: string };
type DateStatusConfig = { ranges: DateStatusRange[]; above_all: string; no_answer: string };

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
  date_status_ranges: DateStatusConfig | null;
};

type CrmStatus = { id: string; key: string; label: string; position: number; color: string };
type Company = { id: string; name: string };

export default function NewLeadPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [fields, setFields] = useState<FormField[]>([]);
  const [statuses, setStatuses] = useState<CrmStatus[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [currentUserName, setCurrentUserName] = useState("");
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [formStatus, setFormStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [step, setStep] = useState(0); // 0 = info step, then groups of 2 fields

  useEffect(() => {
    const onLine = () => setIsOnline(true);
    const offLine = () => setIsOnline(false);
    window.addEventListener("online", onLine);
    window.addEventListener("offline", offLine);
    return () => { window.removeEventListener("online", onLine); window.removeEventListener("offline", offLine); };
  }, []);

  // Load from cache helper
  const loadFromCache = useCallback(() => {
    try {
      const cachedFields = JSON.parse(localStorage.getItem("crm_cache_fields") || "[]");
      const cachedStatuses = JSON.parse(localStorage.getItem("crm_cache_statuses") || "[]");
      const cachedCompanies = JSON.parse(localStorage.getItem("crm_cache_companies") || "[]");
      const cachedUsername = localStorage.getItem("crm_cache_username") || "";
      setFields(cachedFields);
      setStatuses(cachedStatuses);
      setCompanies(cachedCompanies);
      setCurrentUserName(cachedUsername);
      if (cachedStatuses.length > 0 && !formStatus) {
        setFormStatus(searchParams.get("status") || cachedStatuses[0].key);
      }
      return cachedFields.length > 0 || cachedStatuses.length > 0;
    } catch {
      return false;
    }
  }, [searchParams, formStatus]);

  useEffect(() => {
    // Always load cache first for instant display
    loadFromCache();

    // If online, fetch fresh data
    if (!navigator.onLine) return;

    const fetchData = async () => {
      try {
        const [{ data: flds }, { data: sts }, { data: comps }, { data: profs }] = await Promise.all([
          supabase.from("crm_form_fields").select("*").order("position"),
          supabase.from("crm_statuses").select("*").order("position"),
          supabase.from("companies").select("id, name").order("name"),
          supabase.rpc("get_profile_names"),
        ]);
        if (flds) setFields(flds as unknown as FormField[]);
        if (sts) setStatuses(sts as CrmStatus[]);
        if (comps) setCompanies(comps as Company[]);
        if (sts && sts.length > 0) setFormStatus(searchParams.get("status") || sts[0].key);
        const me = (profs || []).find((p: any) => p.user_id === user?.id);
        setCurrentUserName(me?.full_name || user?.email || "");

        // Update cache
        try {
          localStorage.setItem("crm_cache_fields", JSON.stringify(flds || []));
          localStorage.setItem("crm_cache_statuses", JSON.stringify(sts || []));
          localStorage.setItem("crm_cache_companies", JSON.stringify(comps || []));
          localStorage.setItem("crm_cache_username", me?.full_name || user?.email || "");
        } catch {}
      } catch {
        // Network failed, cache already loaded above
      }
    };

    fetchData();
  }, [user, loadFromCache]);

  // Sync offline queue when online
  useEffect(() => {
    if (isOnline) {
      syncOfflineQueue().then((syncedIds) => {
        if (syncedIds.length > 0) toast.success(`${syncedIds.length} lead(s) sincronizado(s)!`);
      });
    }
  }, [isOnline]);

  const set = (key: string, val: any) => setFormData({ ...formData, [key]: val });

  const toggleArray = (key: string, item: string) => {
    const arr: string[] = formData[key] || [];
    set(key, arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]);
  };

  const isFieldVisible = useCallback((field: FormField): boolean => {
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
  }, [fields, formData]);

  // Get visible root fields and their visible children flattened
  const getVisibleFields = useCallback((): FormField[] => {
    const result: FormField[] = [];
    const addWithChildren = (field: FormField) => {
      if (!isFieldVisible(field)) return;
      result.push(field);
      fields
        .filter((f) => f.parent_field_id === field.id)
        .sort((a, b) => a.position - b.position)
        .forEach(addWithChildren);
    };
    fields
      .filter((f) => !f.parent_field_id)
      .sort((a, b) => a.position - b.position)
      .forEach(addWithChildren);
    return result;
  }, [fields, isFieldVisible]);

  const visibleFields = getVisibleFields();

  // Group visible fields in pages of 2
  const FIELDS_PER_PAGE = 2;
  const totalFieldPages = Math.ceil(visibleFields.length / FIELDS_PER_PAGE);
  const totalSteps = 1 + totalFieldPages + 1; // step 0 = info, steps 1..N = field pages, last = preview
  const previewStep = totalSteps - 1;
  const isPreviewStep = step === previewStep;
  const currentPageFields = step > 0 && !isPreviewStep
    ? visibleFields.slice((step - 1) * FIELDS_PER_PAGE, step * FIELDS_PER_PAGE)
    : [];

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
      fields
        .filter((f) => f.parent_field_id === field.id)
        .sort((a, b) => a.position - b.position)
        .forEach(processField);
    };
    fields
      .filter((f) => !f.parent_field_id)
      .sort((a, b) => a.position - b.position)
      .forEach(processField);
    return answers;
  };

  const resolveStatus = (): string => {
    const defaultStatus = statuses.length > 0 ? statuses[0].key : formStatus;

    // Check date-based mapping first
    const dateFields = fields.filter(f => f.date_status_ranges && f.field_type === "date");
    for (const df of dateFields) {
      const fieldKey = `field_${df.id}`;
      const dateVal = formData[fieldKey];
      const config = df.date_status_ranges!;
      if (!dateVal || (typeof dateVal === "string" && !dateVal.trim())) {
        if (config.no_answer) return config.no_answer;
        continue;
      }
      const diffMs = Date.now() - new Date(dateVal).getTime();
      const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);
      const sortedRanges = [...config.ranges].sort((a, b) => a.max_years - b.max_years);
      let matched = false;
      for (const range of sortedRanges) {
        if (diffYears <= range.max_years && range.status_key) {
          return range.status_key;
        }
      }
      if (!matched && config.above_all) return config.above_all;
    }

    // Then check option-based mapping
    const mappingFields = fields.filter(f => f.status_mapping && Object.keys(f.status_mapping).length > 0);
    if (mappingFields.length === 0 && dateFields.length === 0) return formStatus;
    for (const mf of [...mappingFields].reverse()) {
      const fieldKey = `field_${mf.id}`;
      const answer = formData[fieldKey];
      if (!answer || (typeof answer === "string" && !answer.trim())) continue;
      const mapping = mf.status_mapping!;
      if (typeof answer === "string" && mapping[answer]) return mapping[answer];
      if (Array.isArray(answer)) {
        for (const v of answer) {
          if (mapping[v]) return mapping[v];
        }
      }
    }
    return defaultStatus;
  };

  const handleSubmit = async () => {
    // Validate all required visible fields
    const missing = visibleFields.filter(f => {
      if (!f.is_required) return false;
      const val = formData[`field_${f.id}`];
      if (val === undefined || val === null || val === "") return true;
      if (Array.isArray(val) && val.length === 0) return true;
      return false;
    });
    if (missing.length > 0) {
      toast.error(`Preencha o campo obrigatório: ${missing[0].label}`);
      return;
    }

    setSaving(true);
    const resolvedStatus = resolveStatus();
    const leadData = {
      id: crypto.randomUUID(),
      data: formData,
      status: resolvedStatus,
      assigned_to: user?.id || null,
      created_by: user!.id,
      created_at: new Date().toISOString(),
    };

    if (!isOnline) {
      addToOfflineQueue(leadData);
      toast.success("Lead salvo offline! Será sincronizado quando tiver internet.");
      setSaving(false);
      // Reset form for next lead
      setFormData({});
      setStep(0);
      navigate("/");
      return;
    }

    // Check for existing lead with same name + phone
    let existingLead: any = null;
    try {
      const { data: ffMarkers } = await supabase.from("crm_form_fields").select("id, is_name_field, is_phone_field");
      const nameIds = (ffMarkers || []).filter((f: any) => f.is_name_field).map((f: any) => f.id);
      const phoneIds = (ffMarkers || []).filter((f: any) => f.is_phone_field).map((f: any) => f.id);

      const leadName = nameIds.reduce<string | null>((found: string | null, id: string) => found || formData[`field_${id}`] || null, null) || "";
      const leadPhone = phoneIds.reduce<string | null>((found: string | null, id: string) => found || formData[`field_${id}`] || null, null) || "";

      if (leadName && leadPhone) {
        const { data: allLeads } = await supabase.from("crm_leads").select("*");
        if (allLeads) {
          existingLead = allLeads.find((l: any) => {
            const d = typeof l.data === "object" ? (l.data as Record<string, any>) : {};
            const eName = nameIds.reduce<string | null>((f: string | null, id: string) => f || d[`field_${id}`] || null, null) || d.nome_lead || "";
            const ePhone = phoneIds.reduce<string | null>((f: string | null, id: string) => f || d[`field_${id}`] || null, null) || d.telefone || "";
            return String(eName).trim().toLowerCase() === String(leadName).trim().toLowerCase()
              && String(ePhone).replace(/\D/g, "") === String(leadPhone).replace(/\D/g, "");
          }) || null;
        }
      }
    } catch {}

    if (existingLead) {
      const { error } = await supabase.from("crm_leads").update({
        data: formData,
        status: resolvedStatus,
        assigned_to: user?.id || null,
      }).eq("id", existingLead.id);
      if (error) {
        addToOfflineQueue(leadData);
        toast.warning("Erro ao atualizar. Salvo offline.");
      } else {
        toast.success("Lead já existia — informações atualizadas!");
      }
    } else {
      const { error } = await supabase.from("crm_leads").insert({
        data: formData,
        status: resolvedStatus,
        assigned_to: user?.id || null,
        created_by: user!.id,
      });
      if (error) {
        addToOfflineQueue(leadData);
        toast.warning("Erro ao enviar. Salvo offline para sincronizar depois.");
      } else {
        toast.success("Lead criado com sucesso!");
      }
    }

    setSaving(false);
    setFormData({});
    setStep(0);
    navigate("/");
  };

  const renderFormField = (field: FormField) => {
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

        {field.field_type === "phone" && (
          <Input
            type="tel"
            inputMode="numeric"
            placeholder="(00) 00000-0000"
            value={formatPhoneBR(value)}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
              set(fieldKey, digits);
            }}
            required={field.is_required}
            maxLength={16}
          />
        )}

        {field.field_type === "date" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4 text-destructive" />
                {value ? format(new Date(value + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR }) : "Selecionar data"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={value ? new Date(value + "T00:00:00") : undefined}
                onSelect={(d) => set(fieldKey, d ? format(d, "yyyy-MM-dd") : "")}
                locale={ptBR}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        )}

        {["text", "number", "email"].includes(field.field_type) && (
          <Input
            type={field.field_type}
            value={value}
            onChange={(e) => set(fieldKey, e.target.value)}
            required={field.is_required}
          />
        )}

        {/* Fallback for unknown field types (e.g. cached PWA with old bundle) */}
        {!["select", "checkbox_group", "textarea", "phone", "text", "number", "date", "email"].includes(field.field_type) && (
          <Input
            type="text"
            value={value}
            onChange={(e) => set(fieldKey, e.target.value)}
            required={field.is_required}
          />
        )}
      </div>
    );
  };

  const offlineCount = getOfflineQueue().length;

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Novo Lead</h1>
            <p className="text-xs text-muted-foreground">
              Passo {step + 1} de {totalSteps}
            </p>
          </div>
          {!isOnline && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 text-amber-600 text-xs font-medium">
              <WifiOff className="h-3.5 w-3.5" />
              Offline
            </div>
          )}
          {offlineCount > 0 && (
            <div className="text-xs text-muted-foreground">
              {offlineCount} pendente{offlineCount !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-muted rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
          />
        </div>

        {/* Step 0: Basic info */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Input value={companies.map(c => c.name).join(", ") || "—"} readOnly className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Vendedor Responsável</Label>
              <Input value={currentUserName || "—"} readOnly className="bg-muted" />
            </div>
            {!fields.some(f => (f.status_mapping && Object.keys(f.status_mapping).length > 0) || f.date_status_ranges) ? (
              <div className="space-y-2">
                <Label>Coluna (Status) <span className="text-destructive">*</span></Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => (
                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
                ℹ️ A coluna será definida automaticamente com base nas respostas.
              </p>
            )}
          </div>
        )}

        {/* Field pages */}
        {step > 0 && !isPreviewStep && (
          <div className="space-y-4">
            {currentPageFields.map(renderFormField)}
          </div>
        )}

        {/* Preview step */}
        {isPreviewStep && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              📋 Confira as respostas antes de salvar o lead:
            </p>
            <div className="rounded-lg border bg-muted/30 divide-y divide-border">
              <div className="flex justify-between items-center px-4 py-2.5">
                <span className="text-sm font-medium text-muted-foreground">Empresa</span>
                <span className="text-sm text-foreground font-medium">
                  {companies.map(c => c.name).join(", ") || "—"}
                </span>
              </div>
              <div className="flex justify-between items-center px-4 py-2.5">
                <span className="text-sm font-medium text-muted-foreground">Vendedor</span>
                <span className="text-sm text-foreground font-medium">{currentUserName || "—"}</span>
              </div>
              {getVisibleAnswers().map((item, i) => (
                <div key={i} className="flex justify-between items-start px-4 py-2.5 gap-4">
                  <span className="text-sm font-medium text-muted-foreground shrink-0">{item.label}</span>
                  <span className="text-sm text-foreground font-medium text-right">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-8">
          {step > 0 && (
            <Button variant="outline" className="flex-1" onClick={() => setStep(step - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          )}
          {step < previewStep ? (
            <Button className="flex-1" onClick={() => {
              // Validate required fields on current page
              if (step > 0) {
                const missing = currentPageFields.filter(f => {
                  if (!f.is_required) return false;
                  const val = formData[`field_${f.id}`];
                  if (val === undefined || val === null || val === "") return true;
                  if (Array.isArray(val) && val.length === 0) return true;
                  return false;
                });
                if (missing.length > 0) {
                  toast.error(`Preencha o campo obrigatório: ${missing[0].label}`);
                  return;
                }
              }
              setStep(step + 1);
            }} disabled={step === 0 && !formStatus}>
              {step === previewStep - 1
                ? <><Eye className="h-4 w-4 mr-1" /> Revisar</>
                : <>Próximo <ChevronRight className="h-4 w-4 ml-1" /></>
              }
            </Button>
          ) : (
            <Button className="flex-1" onClick={handleSubmit} disabled={saving}>
              {saving ? "Salvando..." : <><Check className="h-4 w-4 mr-1" /> Confirmar</>}
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
