import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CrmColumn = {
  id: string;
  name: string;
  field_key: string;
  field_type: string;
  options: any;
  position: number;
  is_required: boolean;
};

type Profile = { user_id: string; full_name: string; email: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  columns: CrmColumn[];
  profiles: Profile[];
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

export default function LeadFormDialog({
  open, onOpenChange, columns, profiles, formData, setFormData,
  formStatus, setFormStatus, formAssigned, setFormAssigned,
  saving, isEditing, onSubmit, statusOptions, statusLabels,
}: Props) {
  const renderFieldInput = (col: CrmColumn) => {
    const value = formData[col.field_key] || "";
    if (col.field_type === "select" && Array.isArray(col.options)) {
      return (
        <Select value={value} onValueChange={(v) => setFormData({ ...formData, [col.field_key]: v })}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {(col.options as string[]).map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    const inputType = col.field_type === "number" ? "number" : col.field_type === "date" ? "date" : col.field_type === "email" ? "email" : "text";
    return (
      <Input
        type={inputType}
        value={value}
        onChange={(e) => setFormData({ ...formData, [col.field_key]: e.target.value })}
        required={col.is_required}
      />
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Lead" : "Novo Lead"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {columns.map((col) => (
            <div key={col.id} className="space-y-2">
              <Label>{col.name}{col.is_required && " *"}</Label>
              {renderFieldInput(col)}
            </div>
          ))}
          <div className="space-y-2">
            <Label>Status</Label>
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
            <Label>Atribuído a</Label>
            <Select value={formAssigned || "__none__"} onValueChange={(v) => setFormAssigned(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Ninguém" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Ninguém</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.full_name || p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Salvando..." : isEditing ? "Atualizar" : "Criar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
