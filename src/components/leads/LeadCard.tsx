import { Button } from "@/components/ui/button";
import { Pencil, Trash2, User, MessageSquare, CloudOff, CheckCircle2 } from "lucide-react";

type Profile = { user_id: string; full_name: string; email?: string };

type LeadCardProps = {
  lead: { id: string; data: Record<string, any>; assigned_to: string | null; status: string; created_at: string };
  columns: { field_key: string; name: string }[];
  profiles: Profile[];
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
  syncStatus?: "offline" | "synced" | null;
};

export default function LeadCard({ lead, columns, profiles, isAdmin, onEdit, onDelete, onHistory, syncStatus }: LeadCardProps) {
  const data = typeof lead.data === "object" ? (lead.data as Record<string, any>) : {};
  const assignedProfile = profiles.find((p) => p.user_id === lead.assigned_to);
  const displayName = data.nome_lead || (columns[0] && data[columns[0].field_key]) || "Sem nome";
  const displaySecondary = data.telefone || (columns[1] && data[columns[1].field_key]) || "—";

  const isOffline = syncStatus === "offline";
  const isSynced = syncStatus === "synced";

  return (
    <div className={`rounded-lg border bg-card p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing group ${
      isOffline ? "border-amber-500/50 bg-amber-500/5" : isSynced ? "border-emerald-500/50 bg-emerald-500/5" : ""
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {syncStatus && (
            <div className="shrink-0 mt-0.5">
              {isOffline ? (
                <CloudOff className="h-4 w-4 text-amber-500" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              )}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">
              {displayName}
            </p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {displaySecondary}
            </p>
          </div>
        </div>
        {!isOffline && (
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
        )}
      </div>

      {isOffline && (
        <p className="text-xs text-amber-500 mt-1 font-medium">Aguardando sincronização...</p>
      )}
      {isSynced && (
        <p className="text-xs text-emerald-500 mt-1 font-medium">Sincronizado ✓</p>
      )}

      {data.forma_captacao && (
        <p className="text-xs text-muted-foreground mt-1 truncate">
          <span className="font-medium">Captação:</span> {data.forma_captacao}
        </p>
      )}
      {data.cidade_uf && (
        <p className="text-xs text-muted-foreground mt-1 truncate">
          <span className="font-medium">Cidade:</span> {data.cidade_uf}
        </p>
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
