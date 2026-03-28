import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Scissors } from "lucide-react";
import { MAX_DURATION_S, videoToGif } from "@/lib/gifEncoder";

interface VideoTrimmerProps {
  file: File;
  onGifReady: (blob: Blob) => void;
  onCancel: () => void;
}

export function VideoTrimmer({ file, onGifReady, onCancel }: VideoTrimmerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const dur = video.duration;
    setDuration(dur);
    setEnd(Math.min(dur, MAX_DURATION_S));
  }, []);

  const trimDuration = end - start;
  const exceedsMax = trimDuration > MAX_DURATION_S;

  const handleStartChange = (value: number) => {
    const s = Math.max(0, Math.min(value, end - 0.5));
    setStart(s);
    if (end - s > MAX_DURATION_S) setEnd(s + MAX_DURATION_S);
    if (videoRef.current) videoRef.current.currentTime = s;
  };

  const handleEndChange = (value: number) => {
    const e = Math.min(duration, Math.max(value, start + 0.5));
    setEnd(e);
    if (e - start > MAX_DURATION_S) setStart(e - MAX_DURATION_S);
    if (videoRef.current) videoRef.current.currentTime = e;
  };

  const handleCreateGif = async () => {
    const video = videoRef.current;
    if (!video) return;
    setProcessing(true);
    try {
      video.pause();
      const blob = await videoToGif(video, start, end);
      onGifReady(blob);
    } catch {
      setProcessing(false);
    }
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    const ms = Math.round((s % 1) * 10);
    return `${mins}:${String(secs).padStart(2, "0")}.${ms}`;
  };

  return (
    <div className="space-y-4">
      <video
        ref={videoRef}
        src={videoUrl}
        onLoadedMetadata={handleLoadedMetadata}
        controls
        playsInline
        muted
        className="w-full rounded-lg bg-black"
        style={{ maxHeight: 280 }}
      />

      {duration > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Extrait : {trimDuration.toFixed(1)}s / {MAX_DURATION_S}s max</span>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Début : {formatTime(start)}</label>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.1}
              value={start}
              onChange={(e) => handleStartChange(parseFloat(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Fin : {formatTime(end)}</label>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.1}
              value={end}
              onChange={(e) => handleEndChange(parseFloat(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel} disabled={processing} className="flex-1">
              Annuler
            </Button>
            <Button
              onClick={handleCreateGif}
              disabled={processing || exceedsMax}
              className="flex-1"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Conversion...
                </>
              ) : (
                <>
                  <Scissors className="mr-2 h-4 w-4" />
                  Créer le GIF
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
