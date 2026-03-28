# Exercise Video → GIF Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow coaches to film or import a video of an exercise, trim it to max 5 seconds, convert it to a compressed GIF (~240px, ≤200KB), and upload it as an exercise illustration.

**Architecture:** Client-side only. A `<video>` element + Canvas API extracts frames from the trimmed segment, `gifenc` assembles them into a GIF. The result is uploaded to the existing `exercise-gifs` Supabase bucket. The existing `illustration_gif` field stores the URL.

**Tech Stack:** React, TypeScript, gifenc, Canvas API, Supabase Storage, Shadcn Sheet/Slider

---

### Task 1: Install gifenc dependency

**Files:**
- Modify: `package.json`

**Step 1: Install gifenc**

Run: `npm install gifenc`

**Step 2: Verify installation**

Run: `npm ls gifenc`
Expected: `gifenc@x.x.x`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add gifenc dependency for exercise video-to-GIF"
```

---

### Task 2: Create gifEncoder utility

**Files:**
- Create: `src/lib/gifEncoder.ts`
- Test: `src/lib/__tests__/gifEncoder.test.ts`

**Step 1: Write the test**

```typescript
// src/lib/__tests__/gifEncoder.test.ts
import { describe, it, expect } from "vitest";
import { extractFrames, clampTrimRange } from "../gifEncoder";

describe("clampTrimRange", () => {
  it("clamps end to start + MAX_DURATION when range exceeds 5s", () => {
    expect(clampTrimRange(2, 10, 20)).toEqual([2, 7]);
  });

  it("keeps valid range unchanged", () => {
    expect(clampTrimRange(1, 4, 20)).toEqual([1, 4]);
  });

  it("clamps end to duration", () => {
    expect(clampTrimRange(18, 25, 20)).toEqual([18, 20]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/gifEncoder.test.ts`
Expected: FAIL — module not found

**Step 3: Write the gifEncoder utility**

```typescript
// src/lib/gifEncoder.ts
import { GIFEncoder, quantize, applyPalette } from "gifenc";

export const MAX_GIF_WIDTH = 240;
export const MAX_DURATION_S = 5;
const TARGET_FPS = 2;
const DELAY = Math.round(1000 / TARGET_FPS); // ms per frame for GIF

/**
 * Clamp a trim range to MAX_DURATION_S and video duration.
 */
export function clampTrimRange(
  start: number,
  end: number,
  duration: number,
): [number, number] {
  const clampedEnd = Math.min(end, duration, start + MAX_DURATION_S);
  return [start, clampedEnd];
}

/**
 * Extract frames from a video element at the given time range.
 * Returns an array of ImageData objects (resized to MAX_GIF_WIDTH).
 */
export async function extractFrames(
  video: HTMLVideoElement,
  startS: number,
  endS: number,
): Promise<{ frames: ImageData[]; width: number; height: number }> {
  const [s, e] = clampTrimRange(startS, endS, video.duration);
  const durationS = e - s;
  const frameCount = Math.max(2, Math.round(durationS * TARGET_FPS));

  // Compute scaled dimensions
  const ratio = Math.min(MAX_GIF_WIDTH / video.videoWidth, 1);
  const width = Math.round(video.videoWidth * ratio);
  const height = Math.round(video.videoHeight * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const frames: ImageData[] = [];

  for (let i = 0; i < frameCount; i++) {
    const time = s + (i * durationS) / (frameCount - 1);
    await seekTo(video, time);
    ctx.drawImage(video, 0, 0, width, height);
    frames.push(ctx.getImageData(0, 0, width, height));
  }

  return { frames, width, height };
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = time;
  });
}

/**
 * Encode extracted frames into a GIF blob.
 */
export function encodeGif(
  frames: ImageData[],
  width: number,
  height: number,
): Blob {
  const gif = GIFEncoder();

  for (const frame of frames) {
    const palette = quantize(frame.data, 256);
    const index = applyPalette(frame.data, palette);
    gif.writeFrame(index, width, height, { palette, delay: DELAY });
  }

  gif.finish();
  return new Blob([gif.bytes()], { type: "image/gif" });
}

/**
 * Full pipeline: extract frames from video + encode to GIF blob.
 */
export async function videoToGif(
  video: HTMLVideoElement,
  startS: number,
  endS: number,
): Promise<Blob> {
  const { frames, width, height } = await extractFrames(video, startS, endS);
  return encodeGif(frames, width, height);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/gifEncoder.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/gifEncoder.ts src/lib/__tests__/gifEncoder.test.ts
git commit -m "feat: add gifEncoder utility (Canvas + gifenc)"
```

---

### Task 3: Create VideoTrimmer component

**Files:**
- Create: `src/components/coach/strength/VideoTrimmer.tsx`

This is the core UI: video preview + dual-handle range slider + "Créer le GIF" button.

**Step 1: Write the VideoTrimmer component**

```tsx
// src/components/coach/strength/VideoTrimmer.tsx
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

  // Create object URL for the video file
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
      {/* Video preview */}
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

      {/* Trim controls */}
      {duration > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Extrait : {trimDuration.toFixed(1)}s / {MAX_DURATION_S}s max</span>
          </div>

          {/* Start slider */}
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

          {/* End slider */}
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

          {/* Action buttons */}
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
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors from this file

**Step 3: Commit**

```bash
git add src/components/coach/strength/VideoTrimmer.tsx
git commit -m "feat: add VideoTrimmer component (dual-slider, 5s max)"
```

---

### Task 4: Create MediaSourceSheet component

**Files:**
- Create: `src/components/coach/strength/MediaSourceSheet.tsx`

Bottom sheet with "Filmer" and "Importer" options, plus the VideoTrimmer when a video is selected.

**Step 1: Write the MediaSourceSheet component**

```tsx
// src/components/coach/strength/MediaSourceSheet.tsx
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
      // Image or GIF — pass through directly
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
            {/* Capture from camera */}
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

            {/* Import from gallery */}
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
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors from this file

**Step 3: Commit**

```bash
git add src/components/coach/strength/MediaSourceSheet.tsx
git commit -m "feat: add MediaSourceSheet (camera/import bottom sheet)"
```

---

### Task 5: Integrate into StrengthCatalog

**Files:**
- Modify: `src/pages/coach/StrengthCatalog.tsx`

Replace the two existing GIF upload buttons (edit form ~L708-741, create form ~L833-865) with the new MediaSourceSheet flow.

**Step 1: Add imports**

Add to imports at top of `StrengthCatalog.tsx`:

```typescript
import { MediaSourceSheet } from "@/components/coach/strength/MediaSourceSheet";
```

**Step 2: Add state for MediaSourceSheet**

Add near the other state declarations (~L296):

```typescript
const [mediaSheetTarget, setMediaSheetTarget] = useState<"edit" | "create" | null>(null);
```

**Step 3: Modify handleGifUpload to accept Blob**

Replace the existing `handleGifUpload` function (L303-324) to handle both File and Blob:

```typescript
const handleGifUpload = async (media: File | Blob, isGif: boolean, setter: (url: string) => void) => {
  const maxSize = 10 * 1024 * 1024;
  if (media.size > maxSize) {
    toast({ title: "Fichier trop volumineux", description: "La taille maximale est de 10 Mo.", variant: "destructive" });
    return;
  }
  setGifUploading(true);
  try {
    const ext = isGif ? "gif" : (media instanceof File ? (media.name.split(".").pop() ?? "gif") : "gif");
    const path = `exercises/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("exercise-gifs").upload(path, media, { upsert: false });
    if (uploadError) throw uploadError;
    const { data: urlData } = supabase.storage.from("exercise-gifs").getPublicUrl(path);
    setter(urlData.publicUrl);
    toast({ title: "Illustration uploadée" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Réessayez.";
    toast({ title: "Erreur d'upload", description: message, variant: "destructive" });
  } finally {
    setGifUploading(false);
  }
};
```

**Step 4: Replace edit form upload button** (~L708-744)

Replace the `<div className="space-y-2">` block for "Illustration (GIF)" in the edit form with:

```tsx
<div className="space-y-2">
  <Label>Illustration</Label>
  <div className="flex gap-2">
    <Input
      value={editingExercise.illustration_gif ?? ""}
      onChange={(e) =>
        setEditingExercise({
          ...editingExercise,
          illustration_gif: e.target.value === "" ? null : e.target.value,
        })
      }
      placeholder="https://..."
      className="flex-1"
    />
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={gifUploading}
      onClick={() => setMediaSheetTarget("edit")}
      aria-label="Ajouter une illustration"
    >
      {gifUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
    </Button>
  </div>
  {editingExercise.illustration_gif && (
    <img src={editingExercise.illustration_gif} alt="Aperçu" className="mt-2 h-20 w-20 rounded-lg object-cover border" />
  )}
</div>
```

**Step 5: Replace create form upload button** (~L833-869)

Same pattern for the create form, with `setMediaSheetTarget("create")`.

**Step 6: Add MediaSourceSheet + handler at the end of the JSX**

Before the closing `</>` of the component, add:

```tsx
<MediaSourceSheet
  open={mediaSheetTarget !== null}
  onOpenChange={(v) => { if (!v) setMediaSheetTarget(null); }}
  onMediaReady={(media, isGif) => {
    if (mediaSheetTarget === "edit") {
      handleGifUpload(media, isGif, (url) =>
        setEditingExercise((prev) => prev ? { ...prev, illustration_gif: url } : prev)
      );
    } else if (mediaSheetTarget === "create") {
      handleGifUpload(media, isGif, (url) =>
        setNewExercise((prev) => ({ ...prev, illustration_gif: url }))
      );
    }
    setMediaSheetTarget(null);
  }}
/>
```

**Step 7: Add Camera import**

Add `Camera` to the lucide-react imports.

**Step 8: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: No errors

**Step 9: Commit**

```bash
git add src/pages/coach/StrengthCatalog.tsx
git commit -m "feat: integrate video→GIF flow in exercise forms"
```

---

### Task 6: Manual E2E testing

**Steps:**
1. Run `npm run dev`
2. Log in as coach → Musculation → onglet Exercices
3. Test "Créer exercice" → bouton caméra → "Importer" → sélectionner une vidéo
4. Vérifier le trimmer : curseurs début/fin, limite 5s, preview vidéo
5. Cliquer "Créer le GIF" → vérifier spinner → GIF uploadé et visible en preview
6. Test avec "Filmer" (si sur mobile ou simulateur)
7. Test avec une image statique → upload direct sans trimmer
8. Modifier un exercice existant → même flow
9. Vérifier que le GIF s'affiche correctement dans les cards d'exercice

---

### Task 7: Documentation

**Files:**
- Modify: `docs/implementation-log.md`
- Modify: `CLAUDE.md` (ajouter fichiers clés)
- Modify: `docs/FEATURES_STATUS.md` (si applicable)

**Step 1: Add implementation log entry**

**Step 2: Update CLAUDE.md fichiers clés table**

Add:
```
| `src/lib/gifEncoder.ts` | Conversion vidéo → GIF (Canvas + gifenc, 240px, ≤200KB) | ~90 lignes |
| `src/components/coach/strength/VideoTrimmer.tsx` | Trimmer vidéo dual-slider (max 5s) | ~130 lignes |
| `src/components/coach/strength/MediaSourceSheet.tsx` | Bottom sheet filmer/importer illustration | ~100 lignes |
```

**Step 3: Commit**

```bash
git add docs/implementation-log.md CLAUDE.md docs/FEATURES_STATUS.md
git commit -m "docs: add exercise video-to-GIF implementation log"
```
