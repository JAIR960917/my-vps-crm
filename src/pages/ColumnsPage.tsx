import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical } from "lucide-react";

type CrmColumn = {
  id: string;
  name: string;
  field_key: string;
  field_type: string;
  options: any;
  position: number;
  is_required: boolean;
};

type EditingColumn = { id: string; name: string } | null;

export default function ColumnsPage() {
  const { isAdmin } = useAuth();
  const [columns, setColumns] = useState<CrmColumn[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [isRequired, setIsRequired] = useState(false);
  const [options, setOptions] = useState("");
  const [editing, setEditing] = useState<EditingColumn>(null);

  const fetchColumns = async () => {
    const { data } = await supabase
      .from("crm_columns")
      .select("*")
      .order("position");
    setColumns(data || []);
  };

  useEffect(() => { fetchColumns(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldKey = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const maxPos = columns.length > 0 ? Math.max(...columns.map(c => c.position)) + 1 : 0;

    const { error } = await supabase.from("crm_columns").insert({
      name,
      field_key: fieldKey,
      field_type: fieldType,
      is_required: isRequired,
      position: maxPos,
      options: fieldType === "select" ? options.split(",").map(o => o.trim()) : null,
    });

    if (error) {
      toast.error("Erro ao criar coluna");
    } else {
      toast.success("Coluna criada");
      setOpen(false);
      setName("");
      setFieldType("text");
      setIsRequired(false);
      setOptions("");
      fetchColumns();
    }
  };

  const handleRename = async () => {
    if (!editing || !editing.name.trim()) return;
    const { error } = await supabase.from("crm_columns").update({ name: editing.name }).eq("id", editing.id);
    if (error) toast.error("Erro ao renomear");
    else { toast.success("Coluna renomeada"); fetchColumns(); }
    setEditing(null);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("crm_columns").delete().eq("id", id);
    if (error) toast.error("Erro ao remover");
    else { toast.success("Coluna removida"); fetchColumns(); }
  };

  if (!isAdmin) {
    return <AppLayout><p className="text-muted-foreground">Acesso restrito a administradores.</p></AppLayout>;
  }

  const typeLabels: Record<string, string> = {
    text: "Texto", number: "Número", date: "Data", select: "Seleção", email: "Email", phone: "Telefone",
  };

  return (
    <AppLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Colunas do CRM</h1>
          <p className="text-sm text-muted-foreground">Personalize os campos dos leads</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Nova Coluna</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Coluna</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da coluna</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex: Origem" />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={fieldType} onValueChange={setFieldType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="number">Número</SelectItem>
                    <SelectItem value="date">Data</SelectItem>
                    <SelectItem value="select">Seleção</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Telefone</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {fieldType === "select" && (
                <div className="space-y-2">
                  <Label>Opções (separadas por vírgula)</Label>
                  <Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Opção 1, Opção 2" />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch checked={isRequired} onCheckedChange={setIsRequired} />
                <Label>Obrigatório</Label>
              </div>
              <Button type="submit" className="w-full">Criar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Chave</TableHead>

              <TableHead>Tipo</TableHead>
              <TableHead>Obrigatório</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {columns.map((col) => (
              <TableRow key={col.id}>
                <TableCell className="font-medium">
                  {editing?.id === col.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        className="h-8 w-40"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setEditing(null); }}
                      />
                      <Button size="sm" variant="outline" className="h-8" onClick={handleRename}>OK</Button>
                    </div>
                  ) : (
                    <span className="cursor-pointer hover:underline" onClick={() => setEditing({ id: col.id, name: col.name })}>
                      {col.name}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{col.field_key}</TableCell>
                <TableCell>{typeLabels[col.field_type] || col.field_type}</TableCell>
                <TableCell>{col.is_required ? "Sim" : "Não"}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(col.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
}
