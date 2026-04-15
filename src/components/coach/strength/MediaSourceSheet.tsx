import { useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Camera, ImagePlus } from "lucide-react";
import { VideoTrimmer } from "./VideoTrimmer";

interface MediaSourceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMediaReady: (file: File | Blob, isGif: boolean) => void;
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

export function MediaSourceSheet({ open, onOpenChange, onMediaReady }: MediaSourceSheetProps) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = (file: File) => {
    if (isVideoFile(file)) {
      setVideoFile(file);
    } else {
      onMediaReady(file, false);
      handleClose();
    }
  };

  const handleGifReady = (blob: Blob) => {
    onMediaReady(blob, true);
    handleClose();
  };

  const handleClose = () => {
    setVideoFile(null);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8">
        <SheetHeader>
          <SheetTitle>{videoFile ? "Découper la vidéo" : "Illustration exercice"}</SheetTitle>
        </SheetHeader>

        {videoFile ? (
          <div className="mt-4">
            <VideoTrimmer
              file={videoFile}
              onGifReady={handleGifReady}
              onCancel={() => setVideoFile(null)}
            />
          </div>
        ) : (
          <div className="mt-4 flex gap-3">
            <Button
              variant="outline"
              className="flex-1 h-24 flex-col gap-2"
              onClick={() => captureRef.current?.click()}
            >
              <Camera className="h-6 w-6" />
              <span className="text-sm">Filmer</span>
            </Button>
            <input
              ref={captureRef}
              type="file"
              accept="video/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelected(f);
                e.target.value = "";
              }}
            />

            <Button
              variant="outline"
              className="flex-1 h-24 flex-col gap-2"
              onClick={() => importRef.current?.click()}
            >
              <ImagePlus className="h-6 w-6" />
              <span className="text-sm">Importer</span>
            </Button>
            <input
              ref={importRef}
              type="file"
              accept="video/*,image/*,.gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelected(f);
                e.target.value = "";
              }}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default MediaSourceSheet;
