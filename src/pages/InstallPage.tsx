import { usePwaInstall } from "@/hooks/use-pwa-install";
import { Download, Share, Plus, MoreVertical, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function InstallPage() {
  const { canInstall, install, isIOS } = usePwaInstall();

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true;

  if (isStandalone) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Check className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">App já instalado!</h1>
        <p className="text-muted-foreground">Você já está usando o app instalado.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary shadow-lg">
            <Download className="h-10 w-10 text-primary-foreground" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Instalar o App</h1>
          <p className="text-muted-foreground">
            Instale o app no seu celular para acesso rápido e experiência completa.
          </p>
        </div>

        {/* Android / Chrome - botão direto */}
        {canInstall && (
          <Button onClick={install} size="lg" className="w-full gap-2 text-base">
            <Download className="h-5 w-5" />
            Instalar Agora
          </Button>
        )}

        {/* iOS instructions */}
        {isIOS && (
          <div className="space-y-4 rounded-xl border border-border bg-card p-6 text-left">
            <h2 className="text-lg font-semibold text-card-foreground">
              Como instalar no iPhone / iPad
            </h2>
            <p className="text-sm text-muted-foreground">
              No Safari, siga estes passos:
            </p>
            <div className="space-y-4">
              <Step number={1} icon={<Share className="h-5 w-5" />}>
                Toque no ícone de <strong>Compartilhar</strong> (⬆) na barra inferior do Safari
              </Step>
              <Step number={2} icon={<Plus className="h-5 w-5" />}>
                Role para baixo e toque em <strong>"Adicionar à Tela de Início"</strong>
              </Step>
              <Step number={3} icon={<Check className="h-5 w-5" />}>
                Toque em <strong>"Adicionar"</strong> no canto superior direito
              </Step>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              ⚠️ Funciona apenas no <strong>Safari</strong>. Se estiver usando Chrome ou outro navegador, abra este link no Safari primeiro.
            </p>
          </div>
        )}

        {/* Android manual instructions (when beforeinstallprompt didn't fire) */}
        {!isIOS && !canInstall && (
          <div className="space-y-4 rounded-xl border border-border bg-card p-6 text-left">
            <h2 className="text-lg font-semibold text-card-foreground">
              Como instalar no Android
            </h2>
            <p className="text-sm text-muted-foreground">
              No Chrome, siga estes passos:
            </p>
            <div className="space-y-4">
              <Step number={1} icon={<MoreVertical className="h-5 w-5" />}>
                Toque no menu <strong>⋮</strong> (três pontinhos) no canto superior direito
              </Step>
              <Step number={2} icon={<Download className="h-5 w-5" />}>
                Toque em <strong>"Instalar app"</strong> ou <strong>"Adicionar à tela inicial"</strong>
              </Step>
              <Step number={3} icon={<Check className="h-5 w-5" />}>
                Confirme tocando em <strong>"Instalar"</strong>
              </Step>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ number, icon, children }: { number: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
        {number}
      </div>
      <div className="flex-1 pt-1 text-sm text-card-foreground">{children}</div>
    </div>
  );
}
