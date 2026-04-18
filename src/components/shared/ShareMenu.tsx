import { type ReactNode, useCallback, useState } from "react";
import { Copy, Download, Share2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { WhatsAppIcon } from "@/components/shared/icons/WhatsAppIcon";
import { buildShareOptions } from "@/lib/share/buildShareOptions";
import type { SharePayload, ShareOptionId } from "@/lib/share/types";
import {
  copyImage,
  copyText,
  downloadImage,
  nativeShare,
  openWhatsAppLink,
  openWhatsAppWithImage,
} from "@/lib/share/shareActions";

type Props = {
  trigger: ReactNode;
  payload?: SharePayload;
  onOpen?: () => Promise<SharePayload>;
};

const ICONS: Record<ShareOptionId, ReactNode> = {
  "whatsapp-link": <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />,
  "whatsapp-image": <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />,
  "copy-link": <Copy className="h-4 w-4" />,
  "copy-image": <Copy className="h-4 w-4" />,
  "download-image": <Download className="h-4 w-4" />,
  "native-share": <Share2 className="h-4 w-4" />,
};

export function ShareMenu({ trigger, payload, onOpen }: Props) {
  const { toast } = useToast();
  const [resolvedPayload, setResolvedPayload] = useState<SharePayload | null>(payload ?? null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleOpenChange = useCallback(
    async (next: boolean) => {
      if (next && onOpen) {
        setLoading(true);
        try {
          const p = await onOpen();
          setResolvedPayload(p);
          setOpen(true);
        } catch {
          toast({
            title: "Erreur",
            description: "Impossible de préparer le partage.",
            variant: "destructive",
          });
        } finally {
          setLoading(false);
        }
        return;
      }
      if (next && payload) setResolvedPayload(payload);
      setOpen(next);
    },
    [onOpen, payload, toast],
  );

  const run = useCallback(
    async (id: ShareOptionId) => {
      if (!resolvedPayload) return;
      try {
        switch (id) {
          case "whatsapp-link":
            openWhatsAppLink(resolvedPayload.url ?? resolvedPayload.text ?? "");
            break;
          case "whatsapp-image":
            if (!resolvedPayload.imageBlob) return;
            await openWhatsAppWithImage(resolvedPayload.imageBlob);
            toast({
              title: "Image copiée",
              description: "Collez dans la conversation (⌘+V).",
            });
            break;
          case "copy-link":
            await copyText(resolvedPayload.url ?? resolvedPayload.text ?? "");
            toast({ title: "Lien copié !" });
            break;
          case "copy-image":
            if (!resolvedPayload.imageBlob) return;
            await copyImage(resolvedPayload.imageBlob);
            toast({ title: "Image copiée !" });
            break;
          case "download-image":
            if (!resolvedPayload.imageBlob || !resolvedPayload.imageFileName) return;
            downloadImage(resolvedPayload.imageBlob, resolvedPayload.imageFileName);
            break;
          case "native-share":
            await nativeShare(resolvedPayload);
            break;
        }
      } catch (err) {
        toast({
          title: "Erreur",
          description: (err as Error)?.message ?? "Partage impossible.",
          variant: "destructive",
        });
      }
    },
    [resolvedPayload, toast],
  );

  const options = resolvedPayload ? buildShareOptions(resolvedPayload) : [];

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild disabled={loading}>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {options.map((opt) => (
          <DropdownMenuItem key={opt.id} onClick={() => run(opt.id)}>
            {ICONS[opt.id]}
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
