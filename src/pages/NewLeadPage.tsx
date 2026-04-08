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
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, WifiOff } from "lucide-react";
import { addToOfflineQueue, syncOfflineQueue, getOfflineQueue } from "@/lib/offlineSync";

type FormField = {
  id: string;
  label: string;
  field_type: string;
  options: string[] | null;
  position: number;
  is_required: boolean;
  parent_field_id: string | null;
  parent_trigger_value: string | null;
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

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: flds }, { data: sts }, { data: comps }, { data: profs }] = await Promise.all([
        supabase.from("crm_form_fields").select("*").order("position"),
        supabase.from("crm_statuses").select("*").order("position"),
        supabase.from("companies").select("id, name").order("name"),
        supabase.rpc("get_profile_names"),
      ]);
      setFields((flds || []) as FormField[]);
      setStatuses((sts || []) as CrmStatus[]);
      setCompanies((comps || []) as Company[]);
      if (sts && sts.length > 0) setFormStatus(searchParams.get("status") || sts[0].key);
      const me = (profs || []).find((p: any) => p.user_id === user?.id);
      setCurrentUserName(me?.full_name || user?.email || "");

      // Cache for offline
      try {
        localStorage.setItem("crm_cache_fields", JSON.stringify(flds || []));
        localStorage.setItem("crm_cache_statuses", JSON.stringify(sts || []));
        localStorage.setItem("crm_cache_companies", JSON.stringify(comps || []));
        localStorage.setItem("crm_cache_username", me?.full_name || user?.email || "");
      } catch {}
    };

    fetchData().catch(() => {
      // Offline: load from cache
      try {
        setFields(JSON.parse(localStorage.getItem("crm_cache_fields") || "[]"));
        setStatuses(JSON.parse(localStorage.getItem("crm_cache_statuses") || "[]"));
        setCompanies(JSON.parse(localStorage.getItem("crm_cache_companies") || "[]"));
        setCurrentUserName(localStorage.getItem("crm_cache_username") || "");
        const cached = JSON.parse(localStorage.getItem("crm_cache_statuses") || "[]");
        if (cached.length > 0) setFormStatus(cached[0].key);
      } catch {}
    });
  }, [user]);

  // Sync offline queue when online
  useEffect(() => {
    if (isOnline) {
      syncOfflineQueue().then((synced) => {
        if (synced > 0) toast.success(`${synced} lead(s) sincronizado(s)!`);
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
    return formData[`field_${parent.id}`] === field.parent_trigger_value;
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
  const totalSteps = 1 + totalFieldPages; // step 0 = info, steps 1..N = field pages
  const currentPageFields = step > 0
    ? visibleFields.slice((step - 1) * FIELDS_PER_PAGE, step * FIELDS_PER_PAGE)
    : [];

  const handleSubmit = async () => {
    setSaving(true);
    const leadData = {
      id: crypto.randomUUID(),
      data: formData,
      status: formStatus,
      assigned_to: user?.id || null,
      created_by: user!.id,
      created_at: new Date().toISOString(),
    };

    if (!isOnline) {
      addToOfflineQueue(leadData);
      toast.success("Lead salvo offline! Será sincronizado quando tiver internet.");
      setSaving(false);
      navigate("/");
      return;
    }

    const { error } = await supabase.from("crm_leads").insert({
      data: formData,
      status: formStatus,
      assigned_to: user?.id || null,
      created_by: user!.id,
    });

    if (error) {
      // Failed online, save offline
      addToOfflineQueue(leadData);
      toast.warning("Erro ao enviar. Salvo offline para sincronizar depois.");
    } else {
      toast.success("Lead criado com sucesso!");
    }
    setSaving(false);
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
          </div>
        )}

        {/* Field pages */}
        {step > 0 && (
          <div className="space-y-4">
            {currentPageFields.map(renderFormField)}
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-8">
          {step > 0 && (
            <Button variant="outline" className="flex-1" onClick={() => setStep(step - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          )}
          {step < totalSteps - 1 ? (
            <Button className="flex-1" onClick={() => setStep(step + 1)} disabled={step === 0 && !formStatus}>
              Próximo <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button className="flex-1" onClick={handleSubmit} disabled={saving}>
              {saving ? "Salvando..." : "Enviar"}
            </Button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
