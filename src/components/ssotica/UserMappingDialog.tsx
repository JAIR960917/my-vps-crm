import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserCheck, Users } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Funcionario {
  id: string;
  ssotica_funcionario_id: number;
  nome: string;
  funcao: string | null;
  last_seen_at: string;
}

interface Mapping {
  ssotica_funcionario_id: number;
  user_id: string;
}

interface Profile {
  user_id: string;
  full_name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName: string;
}

const UNMAPPED = "__unmapped__";

export function UserMappingDialog({ open, onOpenChange, companyId, companyName }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [mappings, setMappings] = useState<Map<number, string>>(new Map());
  const [profiles, setProfiles] = useState<Profile[]>([]);

  async function fetchData() {
    setLoading(true);
    try {
      const [funcRes, mapRes, profRes] = await Promise.all([
        supabase
          .from("ssotica_funcionarios")
          .select("*")
          .eq("company_id", companyId)
          .order("nome"),
        supabase
          .from("ssotica_user_mappings")
          .select("ssotica_funcionario_id, user_id")
          .eq("company_id", companyId),
        supabase
          .from("profiles")
          .select("user_id, full_name")
          .eq("company_id", companyId)
          .order("full_name"),
      ]);

      setFuncionarios((funcRes.data ?? []) as Funcionario[]);
      const m = new Map<number, string>();
      ((mapRes.data ?? []) as Mapping[]).forEach((row) => {
        m.set(Number(row.ssotica_funcionario_id), row.user_id);
      });
      setMappings(m);
      setProfiles((profRes.data ?? []) as Profile[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && companyId) fetchData();
  }, [open, companyId]);

  async function handleChange(funcionario: Funcionario, value: string) {
    setSaving(funcionario.ssotica_funcionario_id);
    try {
      if (value === UNMAPPED) {
        const { error } = await supabase
          .from("ssotica_user_mappings")
          .delete()
          .eq("company_id", companyId)
          .eq("ssotica_funcionario_id", funcionario.ssotica_funcionario_id);
        if (error) throw error;
        const next = new Map(mappings);
        next.delete(funcionario.ssotica_funcionario_id);
        setMappings(next);
        toast({ title: "Vínculo removido" });
      } else {
        const { error } = await supabase
          .from("ssotica_user_mappings")
          .upsert(
            {
              company_id: companyId,
              ssotica_funcionario_id: funcionario.ssotica_funcionario_id,
              ssotica_funcionario_nome: funcionario.nome,
              user_id: value,
            },
            { onConflict: "company_id,ssotica_funcionario_id" },
          );
        if (error) throw error;
        const next = new Map(mappings);
        next.set(funcionario.ssotica_funcionario_id, value);
        setMappings(next);
        toast({ title: "Vínculo salvo" });
      }
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  const totalMapeados = funcionarios.filter((f) => mappings.has(f.ssotica_funcionario_id)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Vincular vendedores SSótica · {companyName}
          </DialogTitle>
          <DialogDescription>
            Vincule cada vendedor do SSótica a um usuário do CRM. O vínculo é usado para definir o responsável
            das renovações automaticamente. A lista de vendedores é preenchida ao sincronizar a integração.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            Carregando...
          </div>
        ) : funcionarios.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground text-sm">
            Nenhum vendedor SSótica conhecido ainda. Clique em <strong>Sincronizar</strong> nesta loja
            primeiro — os vendedores que aparecerem nas vendas serão listados aqui.
          </div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">
              {totalMapeados} de {funcionarios.length} vendedores vinculados
            </div>
            <div className="space-y-2">
              {funcionarios.map((f) => {
                const current = mappings.get(f.ssotica_funcionario_id) ?? UNMAPPED;
                const isSaving = saving === f.ssotica_funcionario_id;
                return (
                  <div
                    key={f.id}
                    className="flex flex-wrap items-center gap-3 p-3 border rounded-lg bg-card"
                  >
                    <div className="flex-1 min-w-[180px]">
                      <div className="font-medium text-sm flex items-center gap-2">
                        {f.nome}
                        {mappings.has(f.ssotica_funcionario_id) && (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0">
                            <UserCheck className="h-3 w-3 mr-0.5" /> vinculado
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {f.funcao || "sem função"} · ID SSótica: {f.ssotica_funcionario_id} · visto{" "}
                        {format(new Date(f.last_seen_at), "dd/MM HH:mm", { locale: ptBR })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={current}
                        onValueChange={(v) => handleChange(f, v)}
                        disabled={isSaving}
                      >
                        <SelectTrigger className="w-[240px]">
                          <SelectValue placeholder="Não vinculado" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNMAPPED}>— Não vinculado —</SelectItem>
                          {profiles.map((p) => (
                            <SelectItem key={p.user_id} value={p.user_id}>
                              {p.full_name || p.user_id.slice(0, 8)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
