import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, Pencil, Check, X } from "lucide-react";

type CrmColumn = {
  id: string;
  name: string;
  field_key: string;
  field_type: string;
  options: any;
  position: number;
  is_required: boolean;
};

const typeLabels: Record<string, string> = {
  text: "Texto", number: "Número", date: "Data", select: "Seleção", email: "Email", phone: "Telefone",
};

export default function ColumnsPage() {
  const { isAdmin } = useAuth();
  const [columns, setColumns] = useState<CrmColumn[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [isRequired, setIsRequired] = useState(false);
  const [options, setOptions] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [editRequired, setEditRequired] = useState(false);
  const [editOptions, setEditOptions] = useState("");

  const fetchColumns = async () => {
    const { data } = await supabase.from("crm_columns").select("*").order("position");
    setColumns(data || []);
  };

  useEffect(() => { fetchColumns(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldKey = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const maxPos = columns.length > 0 ? Math.max(...columns.map(c => c.position)) + 1 : 0;

    const { error } = await supabase.from("crm_columns").insert({
      name, field_key: fieldKey, field_type: fieldType,
      is_required: isRequired, position: maxPos,
      options: fieldType === "select" ? options.split(",").map(o => o.trim()) : null,
    });

    if (error) toast.error("Erro ao criar coluna");
    else {
      toast.success("Coluna criada");
      setOpen(false); setName(""); setFieldType("text"); setIsRequired(false); setOptions("");
      fetchColumns();
    }
  };

  const startEdit = (col: CrmColumn) => {
    setEditingId(col.id);
    setEditName(col.name);
    setEditType(col.field_type);
    setEditRequired(col.is_required);
    setEditOptions(col.field_type === "select" && Array.isArray(col.options) ? col.options.join(", ") : "");
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    const payload: any = {
      name: editName, field_type: editType, is_required: editRequired,
      options: editType === "select" ? editOptions.split(",").map(o => o.trim()) : null,
    };
    const { error } = await supabase.from("crm_columns").update(payload).eq("id", editingId);
    if (error) toast.error("Erro ao atualizar");
    else { toast.success("Coluna atualizada"); fetchColumns(); }
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("crm_columns").delete().eq("id", id);
    if (error) toast.error("Erro ao remover");
    else { toast.success("Coluna removida"); fetchColumns(); }
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(columns);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setColumns(reordered);

    // Update positions in DB
    const updates = reordered.map((col, i) =>
      supabase.from("crm_columns").update({ position: i }).eq("id", col.id)
    );
    await Promise.all(updates);
  };

  if (!isAdmin) {
    return <AppLayout><p className="text-muted-foreground">Acesso restrito a administradores.</p></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Colunas do CRM</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Personalize os campos dos leads. Arraste para reordenar.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" />Nova Coluna</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar Coluna</DialogTitle></DialogHeader>
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

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="columns-list">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {columns.length === 0 && (
                <div className="text-center text-muted-foreground py-12 border rounded-xl bg-card">
                  Nenhuma coluna criada ainda
                </div>
              )}
              {columns.map((col, index) => (
                <Draggable key={col.id} draggableId={col.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`rounded-xl border bg-card p-3 sm:p-4 transition-shadow ${
                        snapshot.isDragging ? "shadow-lg ring-2 ring-primary/20" : ""
                      }`}
                    >
                      {editingId === col.id ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Nome</Label>
                              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9" autoFocus />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Tipo</Label>
                              <Select value={editType} onValueChange={setEditType}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
                          </div>
                          {editType === "select" && (
                            <div className="space-y-1">
                              <Label className="text-xs">Opções (vírgula)</Label>
                              <Input value={editOptions} onChange={(e) => setEditOptions(e.target.value)} className="h-9" />
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Switch checked={editRequired} onCheckedChange={setEditRequired} />
                              <Label className="text-xs">Obrigatório</Label>
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                                <X className="h-3.5 w-3.5 mr-1" />Cancelar
                              </Button>
                              <Button size="sm" onClick={handleSaveEdit}>
                                <Check className="h-3.5 w-3.5 mr-1" />Salvar
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0">
                            <GripVertical className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                              <span className="font-medium text-sm truncate">{col.name}</span>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="px-1.5 py-0.5 rounded bg-muted">{typeLabels[col.field_type] || col.field_type}</span>
                                {col.is_required && <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">Obrigatório</span>}
                                <span className="hidden sm:inline text-muted-foreground/60">{col.field_key}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(col)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(col.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </AppLayout>
  );
}
