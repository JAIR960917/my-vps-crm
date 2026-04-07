import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Send, MessageSquare, Trash2 } from "lucide-react";

type Note = {
  id: string;
  lead_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type Profile = { user_id: string; full_name: string; email: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string | null;
  leadName: string;
  profiles: Profile[];
  onNoteAdded?: () => void;
};

export default function LeadHistoryDialog({ open, onOpenChange, leadId, leadName, profiles, onNoteAdded }: Props) {
  const { user, isAdmin } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const [sending, setSending] = useState(false);

  const fetchNotes = async () => {
    if (!leadId) return;
    const { data } = await supabase
      .from("crm_lead_notes")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });
    setNotes((data || []) as Note[]);
  };

  useEffect(() => {
    if (open && leadId) fetchNotes();
    if (!open) { setNotes([]); setNewNote(""); }
  }, [open, leadId]);

  const handleSend = async () => {
    if (!newNote.trim() || !leadId || !user) return;
    setSending(true);
    const { error } = await supabase.from("crm_lead_notes").insert({
      lead_id: leadId,
      user_id: user.id,
      content: newNote.trim(),
    });
    if (error) {
      toast.error("Erro ao adicionar nota");
    } else {
      // Update lead's updated_at so it moves to the bottom
      await supabase.from("crm_leads").update({ updated_at: new Date().toISOString() }).eq("id", leadId);
      setNewNote("");
      fetchNotes();
      onNoteAdded?.();
    }
    setSending(false);
  };

  const handleDelete = async (noteId: string) => {
    const { error } = await supabase.from("crm_lead_notes").delete().eq("id", noteId);
    if (error) toast.error("Erro ao remover nota");
    else fetchNotes();
  };

  const getProfileName = (userId: string) => {
    const p = profiles.find((p) => p.user_id === userId);
    return p?.full_name || p?.email || "Usuário";
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
      " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Histórico — {leadName}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 max-h-[50vh] pr-3">
          {notes.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">
              Nenhuma tratativa registrada ainda.
            </p>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => {
                const isOwn = note.user_id === user?.id;
                return (
                  <div key={note.id} className="group rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-foreground">
                        {getProfileName(note.user_id)}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">{formatDate(note.created_at)}</span>
                        {(isOwn || isAdmin) && (
                          <Button
                            variant="ghost" size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleDelete(note.id)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="flex gap-2 pt-2 border-t mt-2">
          <Textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Descreva a tratativa..."
            className="min-h-[60px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
          />
          <Button size="icon" className="shrink-0 self-end" onClick={handleSend} disabled={sending || !newNote.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
