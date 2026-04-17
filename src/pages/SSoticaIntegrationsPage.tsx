import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import {
  Loader2,
  Plug,
  RefreshCw,
  History,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Power,
  Building2,
  Clock,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Company {
  id: string;
  name: string;
  cnpj: string | null;
}

interface Integration {
  id: string;
  company_id: string;
  cnpj: string;
  bearer_token: string;
  is_active: boolean;
  initial_sync_done: boolean;
  last_sync_vendas_at: string | null;
  last_sync_receber_at: string | null;
  sync_status: string;
  last_error: string | null;
}

interface SyncLog {
  id: string;
  sync_type: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  items_processed: number;
  items_created: number;
  items_updated: number;
  error_message: string | null;
  details: any;
}

export default function SSoticaIntegrationsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [editing, setEditing] = useState<{
    company: Company;
    integration?: Integration;
  } | null>(null);
  const [form, setForm] = useState({ cnpj: "", bearer_token: "", is_active: true });
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [logsFor, setLogsFor] = useState<Integration | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [syncHour, setSyncHour] = useState<string>("6");
  const [savingHour, setSavingHour] = useState(false);

  async function fetchAll() {
    setLoading(true);
    const [{ data: comps }, { data: integs }, { data: setting }] = await Promise.all([
      supabase.from("companies").select("id, name, cnpj").order("name"),
      supabase.from("ssotica_integrations").select("*"),
      supabase.from("system_settings").select("setting_value").eq("setting_key", "ssotica_sync_hour").maybeSingle(),
    ]);
    setCompanies(comps ?? []);
    setIntegrations(integs ?? []);
    if (setting?.setting_value) setSyncHour(setting.setting_value);
    setLoading(false);
  }

  async function handleSaveHour() {
    setSavingHour(true);
    try {
      const { data: existing } = await supabase
        .from("system_settings")
        .select("id")
        .eq("setting_key", "ssotica_sync_hour")
        .maybeSingle();
      if (existing) {
        await supabase.from("system_settings").update({ setting_value: syncHour }).eq("id", existing.id);
      } else {
        await supabase.from("system_settings").insert({ setting_key: "ssotica_sync_hour", setting_value: syncHour });
      }
      const { error } = await supabase.rpc("manage_ssotica_cron" as any);
      if (error) throw error;
      toast({ title: "Horário salvo", description: `Sincronização diária agendada para ${syncHour}h (horário de Brasília).` });
    } catch (e: any) {
      toast({ title: "Erro ao salvar horário", description: e.message, variant: "destructive" });
    } finally {
      setSavingHour(false);
    }
  }

  useEffect(() => {
    if (isAdmin) fetchAll();
  }, [isAdmin]);

  if (authLoading) return <div className="p-8">Carregando...</div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  const integrationByCompany = new Map(integrations.map((i) => [i.company_id, i]));

  function openEdit(company: Company) {
    const integration = integrationByCompany.get(company.id);
    setEditing({ company, integration });
    setForm({
      cnpj: integration?.cnpj ?? company.cnpj ?? "",
      bearer_token: integration?.bearer_token ?? "",
      is_active: integration?.is_active ?? true,
    });
  }

  async function handleSave() {
    if (!editing) return;
    if (!form.cnpj.trim() || !form.bearer_token.trim()) {
      toast({ title: "Preencha CNPJ e Token", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        company_id: editing.company.id,
        cnpj: form.cnpj.replace(/\D/g, ""),
        bearer_token: form.bearer_token.trim(),
        is_active: form.is_active,
      };
      if (editing.integration) {
        const { error } = await supabase
          .from("ssotica_integrations")
          .update(payload)
          .eq("id", editing.integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ssotica_integrations").insert(payload);
        if (error) throw error;
      }
      toast({ title: "Integração salva" });
      setEditing(null);
      await fetchAll();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncNow(integ: Integration) {
    setSyncingId(integ.id);
    try {
      const { data, error } = await supabase.functions.invoke("ssotica-sync", {
        body: { integration_id: integ.id },
      });
      if (error) throw error;
      const result = data?.results?.[0];
      if (result?.ok) {
        toast({
          title: "Sincronização concluída",
          description: `Cobranças: +${result.contas_receber.created} novas, ${result.contas_receber.updated} atualizadas. Renovações: +${result.vendas.created} novas, ${result.vendas.updated} atualizadas.`,
        });
      } else {
        toast({
          title: "Erro na sincronização",
          description: result?.error ?? "Erro desconhecido",
          variant: "destructive",
        });
      }
      await fetchAll();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSyncingId(null);
    }
  }

  async function handleToggleActive(integ: Integration) {
    const { error } = await supabase
      .from("ssotica_integrations")
      .update({ is_active: !integ.is_active })
      .eq("id", integ.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: integ.is_active ? "Integração desativada" : "Integração ativada" });
      await fetchAll();
    }
  }

  async function openLogs(integ: Integration) {
    setLogsFor(integ);
    const { data } = await supabase
      .from("ssotica_sync_logs")
      .select("*")
      .eq("integration_id", integ.id)
      .order("started_at", { ascending: false })
      .limit(50);
    setLogs(data ?? []);
  }

  function statusBadge(integ?: Integration) {
    if (!integ) return <Badge variant="outline">Não configurada</Badge>;
    if (!integ.is_active) return <Badge variant="secondary">Desativada</Badge>;
    if (integ.sync_status === "running")
      return <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Sincronizando</Badge>;
    if (integ.sync_status === "error" || integ.last_error)
      return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Erro</Badge>;
    return <Badge className="bg-primary text-primary-foreground"><CheckCircle2 className="h-3 w-3 mr-1" />Conectada</Badge>;
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Plug className="h-6 w-6" /> Integrações SSótica
            </h1>
            <p className="text-muted-foreground text-sm">
              Configure o token de acesso de cada loja. A sincronização roda automaticamente a cada 5 minutos.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : companies.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Nenhuma empresa cadastrada. Vá em <strong>Empresas</strong> para cadastrar as 9 lojas primeiro.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {companies.map((company) => {
              const integ = integrationByCompany.get(company.id);
              return (
                <Card key={company.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base flex items-center gap-2 truncate">
                          <Building2 className="h-4 w-4 shrink-0" />
                          {company.name}
                        </CardTitle>
                        <CardDescription className="truncate">
                          CNPJ: {integ?.cnpj || company.cnpj || "—"}
                        </CardDescription>
                      </div>
                      {statusBadge(integ)}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-3">
                    {integ ? (
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>
                          Última venda sync:{" "}
                          {integ.last_sync_vendas_at
                            ? format(new Date(integ.last_sync_vendas_at), "dd/MM HH:mm", { locale: ptBR })
                            : "nunca"}
                        </div>
                        <div>
                          Última cobrança sync:{" "}
                          {integ.last_sync_receber_at
                            ? format(new Date(integ.last_sync_receber_at), "dd/MM HH:mm", { locale: ptBR })
                            : "nunca"}
                        </div>
                        {integ.last_error && (
                          <div className="text-destructive break-words">⚠ {integ.last_error.slice(0, 120)}</div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Configure CNPJ e Bearer Token desta loja para começar.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-auto pt-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(company)}>
                        <Pencil className="h-3 w-3 mr-1" />
                        {integ ? "Editar" : "Conectar"}
                      </Button>
                      {integ && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleSyncNow(integ)}
                            disabled={syncingId === integ.id || !integ.is_active}
                          >
                            {syncingId === integ.id ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3 mr-1" />
                            )}
                            Sincronizar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openLogs(integ)}>
                            <History className="h-3 w-3 mr-1" />
                            Logs
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleToggleActive(integ)}>
                            <Power className="h-3 w-3 mr-1" />
                            {integ.is_active ? "Desativar" : "Ativar"}
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog de edição */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.integration ? "Editar integração" : "Conectar loja"}: {editing?.company.name}
            </DialogTitle>
            <DialogDescription>
              Cole o CNPJ (apenas números) e o Bearer Token fornecido pelo SSótica.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="cnpj">CNPJ (Código da Licença)</Label>
              <Input
                id="cnpj"
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                placeholder="00000000000000"
              />
            </div>
            <div>
              <Label htmlFor="token">Bearer Token</Label>
              <Input
                id="token"
                type="password"
                value={form.bearer_token}
                onChange={(e) => setForm({ ...form, bearer_token: e.target.value })}
                placeholder="XXXyyyXXXyXXXXXXXXXXyXXXyXXXyXXX"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <Label htmlFor="active">Ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sheet de logs */}
      <Sheet open={!!logsFor} onOpenChange={(o) => !o && setLogsFor(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Logs de sincronização</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 mt-4">
            {logs.length === 0 ? (
              <div className="text-muted-foreground text-sm">Nenhum log ainda.</div>
            ) : (
              logs.map((log) => (
                <Card key={log.id}>
                  <CardContent className="py-3 text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {format(new Date(log.started_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                      </span>
                      <Badge
                        variant={
                          log.status === "success"
                            ? "default"
                            : log.status === "error"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {log.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Processados: {log.items_processed} · Criados: {log.items_created} · Atualizados:{" "}
                      {log.items_updated}
                    </div>
                    {log.error_message && (
                      <div className="text-xs text-destructive break-words">{log.error_message}</div>
                    )}
                    {log.details && (
                      <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
