import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Users, Receipt, CalendarHeart, Phone, PhoneOff, CalendarCheck, CalendarX, Calendar as CalIcon } from "lucide-react";

type Profile = { user_id: string; full_name: string; avatar_url: string | null };

type Totals = {
  leads: number;
  cobrancas: number;
  renovacoes: number;
};

type SellerRow = {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  atendidos: number; // unique cards opened
  agendou: number;
  naoAtendeu: number;
  atendeuSemAgendar: number;
};

const todayBounds = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
};

const formatDateForInput = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export default function DashboardPage() {
  const { user, isAdmin, isGerente, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState<Totals>({ leads: 0, cobrancas: 0, renovacoes: 0 });
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [reportRows, setReportRows] = useState<SellerRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(formatDateForInput(new Date()));

  const canSee = isAdmin || isGerente;

  const fetchTotals = async () => {
    const [leadsRes, cobRes, renRes] = await Promise.all([
      supabase.from("crm_leads").select("id", { count: "exact", head: true }),
      supabase.from("crm_cobrancas").select("id", { count: "exact", head: true }),
      supabase.from("crm_renovacoes").select("id", { count: "exact", head: true }),
    ]);
    setTotals({
      leads: leadsRes.count || 0,
      cobrancas: cobRes.count || 0,
      renovacoes: renRes.count || 0,
    });
  };

  const fetchReport = async (dateStr: string) => {
    const { startISO, endISO } = todayBounds(dateStr);

    // 1) Profiles (visible per RLS — admin sees all, gerente sees own company)
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url");
    const profs = (profilesData || []) as Profile[];
    setProfiles(profs);

    // 2) Card opens for the day (atendimentos)
    const { data: opens } = await supabase
      .from("lead_card_opens")
      .select("user_id, card_type, lead_id, renovacao_id, opened_at")
      .gte("opened_at", startISO)
      .lte("opened_at", endISO);

    // Unique cards opened per user (lead+renovacao counted together)
    const atendidosMap = new Map<string, Set<string>>();
    (opens || []).forEach((o: any) => {
      const key = `${o.card_type}:${o.lead_id || o.renovacao_id}`;
      if (!atendidosMap.has(o.user_id)) atendidosMap.set(o.user_id, new Set());
      atendidosMap.get(o.user_id)!.add(key);
    });

    // 3) Notes from contact attempts saved today
    //    ContactAttemptForm writes structured notes into crm_lead_notes
    const { data: notes } = await supabase
      .from("crm_lead_notes")
      .select("user_id, content, created_at")
      .gte("created_at", startISO)
      .lte("created_at", endISO);

    const agendou = new Map<string, number>();
    const naoAtendeu = new Map<string, number>();
    const atendeuSemAgendar = new Map<string, number>();

    (notes || []).forEach((n: any) => {
      const c: string = n.content || "";
      if (!c.startsWith("📞 Tentativa de contato")) return;
      const inc = (m: Map<string, number>) =>
        m.set(n.user_id, (m.get(n.user_id) || 0) + 1);

      if (c.includes("NÃO ATENDEU")) {
        inc(naoAtendeu);
      } else if (c.includes("ATENDEU")) {
        if (c.includes("✅ Consulta marcada")) inc(agendou);
        else if (c.includes("❌ Consulta NÃO marcada")) inc(atendeuSemAgendar);
        else inc(atendeuSemAgendar);
      }
    });

    // Build per-seller rows (only those with any activity today)
    const userIds = new Set<string>([
      ...atendidosMap.keys(),
      ...agendou.keys(),
      ...naoAtendeu.keys(),
      ...atendeuSemAgendar.keys(),
    ]);

    const rows: SellerRow[] = Array.from(userIds).map((uid) => {
      const p = profs.find((x) => x.user_id === uid);
      return {
        user_id: uid,
        full_name: p?.full_name || "(usuário desconhecido)",
        avatar_url: p?.avatar_url || null,
        atendidos: atendidosMap.get(uid)?.size || 0,
        agendou: agendou.get(uid) || 0,
        naoAtendeu: naoAtendeu.get(uid) || 0,
        atendeuSemAgendar: atendeuSemAgendar.get(uid) || 0,
      };
    });

    rows.sort((a, b) => b.atendidos - a.atendidos);
    setReportRows(rows);
  };

  useEffect(() => {
    if (!canSee || !user) return;
    setLoading(true);
    Promise.all([fetchTotals(), fetchReport(selectedDate)]).finally(() => setLoading(false));
  }, [canSee, user, selectedDate]);

  const reportTotals = useMemo(() => {
    return reportRows.reduce(
      (acc, r) => ({
        atendidos: acc.atendidos + r.atendidos,
        agendou: acc.agendou + r.agendou,
        naoAtendeu: acc.naoAtendeu + r.naoAtendeu,
        atendeuSemAgendar: acc.atendeuSemAgendar + r.atendeuSemAgendar,
      }),
      { atendidos: 0, agendou: 0, naoAtendeu: 0, atendeuSemAgendar: 0 },
    );
  }, [reportRows]);

  if (authLoading) {
    return (
      <AppLayout>
        <Skeleton className="h-32 w-full" />
      </AppLayout>
    );
  }

  if (!canSee) {
    return <Navigate to="/" replace />;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral do CRM e relatório diário de atendimentos por vendedor.
          </p>
        </div>

        {/* Totais */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Leads</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-3xl font-bold">{totals.leads}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Total de leads cadastrados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cobranças</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-3xl font-bold">{totals.cobrancas}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Total de cobranças no sistema</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Renovação</CardTitle>
              <CalendarHeart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-3xl font-bold">{totals.renovacoes}</div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Clientes em renovação</p>
            </CardContent>
          </Card>
        </div>

        {/* Relatório diário */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Relatório de atendimentos</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Quantos cards cada vendedor abriu, quantos clientes atendeu e quantos agendaram.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <CalIcon className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="h-9 w-[160px]"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Resumo do dia */}
            <div className="grid gap-3 sm:grid-cols-4 mb-4">
              <SummaryStat label="Atendidos" value={reportTotals.atendidos} icon={Users} tone="default" />
              <SummaryStat label="Agendaram" value={reportTotals.agendou} icon={CalendarCheck} tone="success" />
              <SummaryStat label="Não atenderam" value={reportTotals.naoAtendeu} icon={PhoneOff} tone="danger" />
              <SummaryStat label="Sem agendar" value={reportTotals.atendeuSemAgendar} icon={CalendarX} tone="warning" />
            </div>

            <Tabs defaultValue="vendedores">
              <TabsList>
                <TabsTrigger value="vendedores">Por vendedor</TabsTrigger>
              </TabsList>
              <TabsContent value="vendedores" className="mt-4">
                {loading ? (
                  <Skeleton className="h-40 w-full" />
                ) : reportRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Nenhum atendimento registrado nesta data.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vendedor</TableHead>
                          <TableHead className="text-center">
                            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Atendidos</span>
                          </TableHead>
                          <TableHead className="text-center">
                            <span className="inline-flex items-center gap-1 text-emerald-600"><CalendarCheck className="h-3.5 w-3.5" /> Agendaram</span>
                          </TableHead>
                          <TableHead className="text-center">
                            <span className="inline-flex items-center gap-1 text-destructive"><PhoneOff className="h-3.5 w-3.5" /> Não atenderam</span>
                          </TableHead>
                          <TableHead className="text-center">
                            <span className="inline-flex items-center gap-1 text-amber-600"><CalendarX className="h-3.5 w-3.5" /> Sem agendar</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportRows.map((row) => (
                          <TableRow key={row.user_id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="h-7 w-7">
                                  <AvatarImage src={row.avatar_url ?? undefined} />
                                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                    {(row.full_name || "?").slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="font-medium">{row.full_name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center font-semibold">{row.atendidos}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 bg-emerald-500/10">
                                {row.agendou}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/10">
                                {row.naoAtendeu}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="border-amber-500/40 text-amber-700 bg-amber-500/10">
                                {row.atendeuSemAgendar}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <p className="text-[11px] text-muted-foreground mt-4">
              <Phone className="h-3 w-3 inline mr-1" />
              "Atendidos" = cards distintos abertos pelo vendedor no dia. "Agendaram", "Não atenderam" e
              "Sem agendar" vêm das tentativas de contato registradas em cada card.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function SummaryStat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: any;
  tone: "default" | "success" | "danger" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/30"
      : tone === "danger"
      ? "text-destructive bg-destructive/10 border-destructive/30"
      : tone === "warning"
      ? "text-amber-700 bg-amber-500/10 border-amber-500/30"
      : "text-foreground bg-muted/40 border-border";
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</span>
        <Icon className="h-4 w-4 opacity-70" />
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
