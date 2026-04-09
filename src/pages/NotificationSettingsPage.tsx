import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Bell, BellOff, Save, Clock, Play } from "lucide-react";

export default function NotificationSettingsPage() {
  const { isAdmin } = useAuth();
  const { subscribe, unsubscribe } = usePushNotifications();
  const [notificationTime, setNotificationTime] = useState("08:00");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Load notification time from system_settings
    const loadSettings = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("setting_value")
        .eq("setting_key", "notification_time")
        .single();
      if (data) setNotificationTime(data.setting_value);
    };
    loadSettings();

    // Check push status
    if ("Notification" in window) {
      setPushEnabled(Notification.permission === "granted");
    }
  }, []);

  const handleSaveTime = async () => {
    setSaving(true);
    try {
      await supabase
        .from("system_settings")
        .update({ setting_value: notificationTime, updated_at: new Date().toISOString() })
        .eq("setting_key", "notification_time");
      // Reset the "already notified today" flag so notifications fire at the new time
      await supabase
        .from("system_settings")
        .update({ setting_value: "", updated_at: new Date().toISOString() })
        .eq("setting_key", "last_scheduled_notification_date");
      toast.success("Horário de notificação salvo!");
    } catch {
      toast.error("Erro ao salvar");
    }
    setSaving(false);
  };

  const handleEnablePush = async () => {
    const result = await subscribe();
    if (result) {
      setPushEnabled(true);
      toast.success("Notificações push ativadas!");
    } else {
      toast.error("Não foi possível ativar. No iPhone, abra o app instalado pela tela inicial e ative por lá.");
    }
  };

  const handleDisablePush = async () => {
    await unsubscribe();
    setPushEnabled(false);
    toast.success("Notificações push desativadas");
  };

  return (
    <AppLayout>
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold">Notificações</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Configure as notificações de leads agendados
        </p>
      </div>

      <div className="max-w-lg space-y-8">
        {/* Push notification toggle */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            {pushEnabled ? (
              <Bell className="h-5 w-5 text-primary" />
            ) : (
              <BellOff className="h-5 w-5 text-muted-foreground" />
            )}
            <div className="flex-1">
              <h3 className="font-semibold text-sm">Notificações Push</h3>
              <p className="text-xs text-muted-foreground">
                Receba alertas no seu dispositivo quando tiver leads agendados para o dia
              </p>
            </div>
          </div>
          {pushEnabled ? (
            <Button variant="outline" size="sm" onClick={handleDisablePush}>
              <BellOff className="mr-1.5 h-3.5 w-3.5" />
              Desativar notificações push
            </Button>
          ) : (
            <Button size="sm" onClick={handleEnablePush}>
              <Bell className="mr-1.5 h-3.5 w-3.5" />
              Ativar notificações push
            </Button>
          )}
        </div>

        {/* Notification time (admin only) */}
        {isAdmin && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <h3 className="font-semibold text-sm">Horário de Notificação</h3>
                <p className="text-xs text-muted-foreground">
                  Define o horário diário em que os atendentes serão notificados sobre leads agendados
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="notification-time" className="shrink-0 text-sm">Horário:</Label>
              <Input
                id="notification-time"
                type="time"
                value={notificationTime}
                onChange={(e) => setNotificationTime(e.target.value)}
                className="w-32"
              />
              <Button size="sm" onClick={handleSaveTime} disabled={saving}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        )}

        {/* Test button (admin only) */}
        {isAdmin && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Play className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <h3 className="font-semibold text-sm">Testar Notificação</h3>
                <p className="text-xs text-muted-foreground">
                  Dispara a verificação de leads agendados para hoje imediatamente
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={async () => {
              try {
                const { data, error } = await supabase.functions.invoke("notify-scheduled-leads", {
                  body: { force: true },
                  headers: { "Content-Type": "application/json" },
                });
                if (error) throw error;
                toast.success(`Resultado: ${data?.message || "OK"} (${data?.notified || 0} notificados)`);
              } catch {
                toast.error("Erro ao testar notificação");
              }
            }}>
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Testar agora
            </Button>
          </div>
        )}

        {/* Info card */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <h3 className="font-semibold text-sm text-primary mb-1">Como funciona?</h3>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Leads agendados para o dia geram uma notificação no horário configurado</li>
            <li>• A notificação é enviada para o atendente responsável pelo lead</li>
            <li>• Você pode ver todas as notificações clicando no sino na barra superior</li>
            <li>• As notificações push funcionam mesmo com o app fechado</li>
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}
