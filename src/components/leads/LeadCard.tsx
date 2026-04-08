import { Button } from "@/components/ui/button";
import { Pencil, Trash2, User, MessageSquare } from "lucide-react";

type Profile = { user_id: string; full_name: string; email?: string };

type LeadCardProps = {
  lead: { id: string; data: Record<string, any>; assigned_to: string | null; status: string; created_at: string };
  columns: { field_key: string; name: string }[];
  profiles: Profile[];
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
};

export default function LeadCard({ lead, columns, profiles, isAdmin, onEdit, onDelete, onHistory }: LeadCardProps) {
  const data = typeof lead.data === "object" ? (lead.data as Record<string, any>) : {};
  const assignedProfile = profiles.find((p) => p.user_id === lead.assigned_to);
  // Use new form fields if available, fallback to dynamic columns
  const displayName = data.nome_lead || (columns[0] && data[columns[0].field_key]) || "Sem nome";
  const displaySecondary = data.telefone || (columns[1] && data[columns[1].field_key]) || "—";

  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {primaryCol && (
            <p className="font-semibold text-sm text-foreground truncate">
              {data[primaryCol.field_key] || "Sem nome"}
            </p>
          )}
          {secondaryCol && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {data[secondaryCol.field_key] || "—"}
            </p>
          )}
        </div>
        <div className="flex gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onHistory(); }}>
            <MessageSquare className="h-3.5 w-3.5 text-primary" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {isAdmin && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
      </div>

      {columns.slice(2, 4).map((col) =>
        data[col.field_key] ? (
          <p key={col.field_key} className="text-xs text-muted-foreground mt-1 truncate">
            <span className="font-medium">{col.name}:</span> {data[col.field_key]}
          </p>
        ) : null
      )}

      {assignedProfile && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t">
          <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-3 w-3 text-primary" />
          </div>
          <span className="text-xs text-muted-foreground truncate">
            {assignedProfile.full_name || assignedProfile.email}
          </span>
        </div>
      )}
    </div>
  );
}
