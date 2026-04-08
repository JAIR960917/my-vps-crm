import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSystemSettings } from "@/contexts/SystemSettingsContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, Upload, Trash2 } from "lucide-react";

type SettingField = {
  key: string;
  label: string;
  type: "text" | "color-hsl";
  placeholder?: string;
};

const FIELDS: SettingField[] = [
  { key: "system_name", label: "Nome do Sistema", type: "text", placeholder: "Ex: Meu CRM" },
  { key: "primary_color", label: "Cor Primária (HSL)", type: "color-hsl", placeholder: "220 72% 50%" },
  { key: "background_color", label: "Cor de Fundo (HSL)", type: "color-hsl", placeholder: "222 47% 6%" },
  { key: "text_color", label: "Cor dos Textos (HSL)", type: "color-hsl", placeholder: "210 20% 92%" },
  { key: "button_color", label: "Cor dos Botões (HSL)", type: "color-hsl", placeholder: "220 72% 55%" },
];

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const { settings, refresh } = useSystemSettings();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setValues({
      system_name: settings.system_name,
      primary_color: settings.primary_color,
      background_color: settings.background_color,
      text_color: settings.text_color,
      button_color: settings.button_color,
      logo_url: settings.logo_url,
    });
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(values)) {
        await supabase
          .from("system_settings")
          .update({ setting_value: value, updated_at: new Date().toISOString() })
          .eq("setting_key", key);
      }
      await refresh();
      toast.success("Configurações salvas!");
    } catch {
      toast.error("Erro ao salvar");
    }
    setSaving(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const ext = file.name.split(".").pop();
    const fileName = `logo_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      toast.error("Erro ao enviar logo");
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("logos").getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    setValues((prev) => ({ ...prev, logo_url: publicUrl }));

    // Save immediately
    await supabase
      .from("system_settings")
      .update({ setting_value: publicUrl, updated_at: new Date().toISOString() })
      .eq("setting_key", "logo_url");

    await refresh();
    toast.success("Logo atualizada!");
    setUploading(false);
  };

  const handleRemoveLogo = async () => {
    setValues((prev) => ({ ...prev, logo_url: "" }));
    await supabase
      .from("system_settings")
      .update({ setting_value: "", updated_at: new Date().toISOString() })
      .eq("setting_key", "logo_url");
    await refresh();
    toast.success("Logo removida");
  };

  // Helper to convert HSL string to CSS color for preview
  const hslPreview = (hsl: string) => {
    try {
      return `hsl(${hsl})`;
    } catch {
      return "#888";
    }
  };

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-muted-foreground">
          Acesso restrito a administradores.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold">Configurações do Sistema</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Personalize a aparência do sistema
        </p>
      </div>

      <div className="max-w-lg space-y-6">
        {/* Logo */}
        <div className="space-y-2">
          <Label>Logo do Sistema</Label>
          <div className="flex items-center gap-4">
            {values.logo_url ? (
              <div className="relative">
                <img
                  src={values.logo_url}
                  alt="Logo"
                  className="h-16 w-16 rounded-lg object-contain border bg-card"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6"
                  onClick={handleRemoveLogo}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="h-16 w-16 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                <Upload className="h-5 w-5 text-muted-foreground/50" />
              </div>
            )}
            <div>
              <label className="cursor-pointer">
                <Button variant="outline" size="sm" asChild disabled={uploading}>
                  <span>
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    {uploading ? "Enviando..." : "Enviar Logo"}
                  </span>
                </Button>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
              </label>
              <p className="text-[11px] text-muted-foreground mt-1">PNG, JPG ou SVG</p>
            </div>
          </div>
        </div>

        {/* Fields */}
        {FIELDS.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label>{field.label}</Label>
            <div className="flex gap-2 items-center">
              <Input
                value={values[field.key] || ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="flex-1"
              />
              {field.type === "color-hsl" && (
                <div
                  className="h-9 w-9 rounded-md border shrink-0"
                  style={{ backgroundColor: hslPreview(values[field.key] || "") }}
                />
              )}
            </div>
          </div>
        ))}

        <Button onClick={handleSave} disabled={saving} className="w-full">
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Salvando..." : "Salvar Configurações"}
        </Button>
      </div>
    </AppLayout>
  );
}
