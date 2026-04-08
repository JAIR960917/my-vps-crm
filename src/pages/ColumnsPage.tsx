import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, Pencil, Check, X } from "lucide-react";

type CrmStatus = {
  id: string;
  key: string;
  label: string;
  position: number;
  color: string;
};

const COLORS = [
  { value: "blue", label: "Azul" },
  { value: "amber", label: "Amarelo" },
  { value: "violet", label: "Violeta" },
  { value: "cyan", label: "Ciano" },
  { value: "emerald", label: "Verde" },
  { value: "red", label: "Vermelho" },
];

const colorDot: Record<string, string> = {
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  violet: "bg-violet-500",
  cyan: "bg-cyan-500",
  emerald: "bg-emerald-500",
  red: "bg-red-500",
};

export default function ColumnsPage() {
  const { isAdmin } = useAuth();
  const [statuses, setStatuses] = useState<CrmStatus[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<CrmStatus | null>(null);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("blue");
  const [saving, setSaving] = useState(false);

  const fetchStatuses = async () => {
    const { data } = await supabase.from("crm_statuses").select("*").order("position");
    setStatuses((data || []) as CrmStatus[]);
  };

  useEffect(() => { fetchStatuses(); }, []);

  const resetForm = () => {
    setLabel("");
    setColor("blue");
    setEditingStatus(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (status: CrmStatus) => {
    setEditingStatus(status);
    setLabel(status.label);
    setColor(status.color);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!label.trim()) return;
    setSaving(true);

    if (editingStatus) {
      const { error } = await supabase
        .from("crm_statuses")
        .update({ label: label.trim(), color })
        .eq("id", editingStatus.id);
      if (error) toast.error("Erro ao atualizar");
      else toast.success("Coluna atualizada");
    } else {
      const key = label.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      const maxPos = statuses.length > 0 ? Math.max(...statuses.map(s => s.position)) + 1 : 0;
      const { error } = await supabase
        .from("crm_statuses")
        .insert({ key, label: label.trim(), color, position: maxPos });
      if (error) toast.error("Erro ao criar coluna");
      else toast.success("Coluna criada");
    }

    setSaving(false);
    setDialogOpen(false);
    resetForm();
    fetchStatuses();
  };

  const handleDelete = async (status: CrmStatus) => {
    // Check if there are leads in this column
    const { count } = await supabase
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .eq("status", status.key);

    if (count && count > 0) {
      toast.error("Remova os leads desta coluna antes de excluí-la");
      return;
    }

    const { error } = await supabase.from("crm_statuses").delete().eq("id", status.id);
    if (error) toast.error("Erro ao excluir");
    else { toast.success("Coluna excluída"); fetchStatuses(); }
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(statuses);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setStatuses(reordered);

    const updates = reordered.map((s, i) =>
      supabase.from("crm_statuses").update({ position: i }).eq("id", s.id)
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
          <p className="text-xs sm:text-sm text-muted-foreground">
            Gerencie as colunas do kanban onde os leads ficam. Arraste para reordenar.
          </p>
        </div>
        <Button size="sm" className="w-full sm:w-auto" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />Nova Coluna
        </Button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="statuses-list">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {statuses.length === 0 && (
                <div className="text-center text-muted-foreground py-12 border rounded-xl bg-card">
                  Nenhuma coluna criada ainda
                </div>
              )}
              {statuses.map((status, index) => (
                <Draggable key={status.id} draggableId={status.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`rounded-xl border bg-card p-3 sm:p-4 transition-shadow ${
                        snapshot.isDragging ? "shadow-lg ring-2 ring-primary/20" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0">
                          <GripVertical className="h-5 w-5" />
                        </div>
                        <div className={`h-3 w-3 rounded-full shrink-0 ${colorDot[status.color] || colorDot.blue}`} />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm">{status.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">({status.key})</span>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(status)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(status)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingStatus ? "Editar Coluna" : "Nova Coluna"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da coluna</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex: Em negociação"
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <Select value={color} onValueChange={setColor}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLORS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex items-center gap-2">
                        <div className={`h-3 w-3 rounded-full ${colorDot[c.value]}`} />
                        {c.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleSave} disabled={saving || !label.trim()}>
              {saving ? "Salvando..." : editingStatus ? "Atualizar" : "Criar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
