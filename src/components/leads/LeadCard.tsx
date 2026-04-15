import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Pencil, Trash2, MessageSquare, CloudOff, CheckCircle2, CalendarPlus } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Profile = { user_id: string; full_name: string; email?: string; avatar_url?: string | null };

type FormFieldInfo = {
  id: string;
  label: string;
  is_name_field?: boolean;
  is_phone_field?: boolean;
  show_on_card?: boolean;
};

type LeadCardProps = {
  lead: {
    id: string;
    data: Record<string, any>;
    assigned_to: string | null;
    status: string;
    created_at: string;
    scheduled_date?: string | null;
    comprou?: boolean;
  };
  columns: { field_key: string; name: string }[];
  formFields: FormFieldInfo[];
  profiles: Profile[];
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
  onSchedule?: () => void;
  onToggleComprou?: (value: boolean) => void;
  syncStatus?: "offline" | "synced" | null;
};

export default function LeadCard({
  lead, columns, formFields, profiles, isAdmin,
  onEdit, onDelete, onHistory, onSchedule, onToggleComprou, syncStatus,
}: LeadCardProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const data = typeof lead.data === "object" ? (lead.data as Record<string, any>) : {};
  const assignedProfile = profiles.find((p) => p.user_id === lead.assigned_to);

  const nameFields = formFields.filter((f) => f.is_name_field);
  const phoneFields = formFields.filter((f) => f.is_phone_field);

  const displayName = nameFields.reduce<string | null>((found, f) => found || data[`field_${f.id}`] || null, null)
    || data.nome_lead
    || (columns[0] && data[columns[0].field_key])
    || "Sem nome";

  const displayPhone = phoneFields.reduce<string | null>((found, f) => found || data[`field_${f.id}`] || null, null)
    || data.telefone
    || null;

  const isOffline = syncStatus === "offline";
  const isSynced = syncStatus === "synced";
  const isScheduled = !!lead.scheduled_date;

  let createdDate = "";
  try {
    createdDate = format(new Date(lead.created_at), "d 'de' MMMM", { locale: ptBR });
  } catch {
    createdDate = "";
  }

  let scheduledDateFormatted = "";
  if (lead.scheduled_date) {
    try {
      scheduledDateFormatted = format(new Date(lead.scheduled_date), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      scheduledDateFormatted = "";
    }
  }

  const nameFieldIds = new Set(nameFields.map((f) => f.id));
  const phoneFieldIds = new Set(phoneFields.map((f) => f.id));

  const cardBorderClass = isOffline
      ? "border-amber-500/50 bg-amber-500/5"
      : isSynced
        ? "border-emerald-500/50 bg-emerald-500/5"
        : "";

  return (
    <div className={`rounded-lg border bg-card p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing group ${cardBorderClass}`}>
      {/* Header */}
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
            <p className="font-bold text-sm text-foreground truncate">{displayName}</p>
            {createdDate && (
              <p className="text-xs text-muted-foreground mt-0.5">{createdDate}</p>
            )}
          </div>
        </div>
        {!isOffline && (
          <div className="flex gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
            {/* Schedule button */}
            {onSchedule && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onSchedule(); }}>
                <CalendarPlus className="h-3.5 w-3.5 text-primary" />
              </Button>
            )}

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

      {/* Phone */}
      {displayPhone && (
        <div className="mt-1.5">
          <p className="text-[11px] text-muted-foreground leading-tight">Telefone</p>
          <p className="text-xs font-medium text-foreground">{displayPhone}</p>
        </div>
      )}

      {/* Fields marked as show_on_card */}
      {formFields
        .filter((f) => f.show_on_card && !nameFieldIds.has(f.id) && !phoneFieldIds.has(f.id))
        .map((f) => {
          const value = data[`field_${f.id}`];
          if (value === undefined || value === null || value === "") return null;
          return (
            <div key={f.id} className="mt-1.5">
              <p className="text-[11px] text-muted-foreground leading-tight">{f.label}</p>
              <p className="text-xs font-medium text-foreground truncate">{String(value)}</p>
            </div>
          );
        })}

      {assignedProfile && (
        <div className="mt-2 pt-2 border-t">
          <p className="text-[11px] text-muted-foreground leading-tight">Pessoa responsável</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Avatar className="h-5 w-5 text-[9px]">
              <AvatarImage src={assignedProfile.avatar_url ?? undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-[9px]">
                {(assignedProfile.full_name || "?").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-medium text-foreground truncate">
              {assignedProfile.full_name || assignedProfile.email}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
