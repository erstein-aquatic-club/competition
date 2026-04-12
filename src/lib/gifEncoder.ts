import * as gifencModule from "gifenc";

type GifencExports = {
  GIFEncoder: () => {
    writeFrame: (
      index: Uint8Array,
      width: number,
      height: number,
      options: { palette: number[][]; delay: number },
    ) => void;
    finish: () => void;
    bytes: () => Uint8Array;
  };
  quantize: (data: Uint8ClampedArray, maxColors: number) => number[][];
  applyPalette: (data: Uint8ClampedArray, palette: number[][]) => Uint8Array;
};

function resolveGifencExports(): GifencExports {
  const moduleLike = gifencModule as unknown as {
    default?: unknown;
    GIFEncoder?: unknown;
    quantize?: unknown;
    applyPalette?: unknown;
  };

  const candidate: unknown =
    "GIFEncoder" in moduleLike
      ? moduleLike
      : moduleLike.default && typeof moduleLike.default === "object"
        ? moduleLike.default
        : null;

  if (
    candidate &&
    typeof candidate === "object" &&
    "GIFEncoder" in candidate &&
    "quantize" in candidate &&
    "applyPalette" in candidate
  ) {
    return candidate as GifencExports;
  }

  throw new Error("gifenc exports are unavailable in this runtime.");
}

const { GIFEncoder, quantize, applyPalette } = resolveGifencExports();

export const MAX_GIF_WIDTH = 240;
export const MAX_DURATION_S = 5;
const TARGET_FPS = 2;
const DELAY = Math.round(1000 / TARGET_FPS);

export function clampTrimRange(
  start: number,
  end: number,
  duration: number,
): [number, number] {
  const clampedEnd = Math.min(end, duration, start + MAX_DURATION_S);
  return [start, clampedEnd];
}

export async function extractFrames(
  video: HTMLVideoElement,
  startS: number,
  endS: number,
): Promise<{ frames: ImageData[]; width: number; height: number }> {
  const [s, e] = clampTrimRange(startS, endS, video.duration);
  const durationS = e - s;
  const frameCount = Math.max(2, Math.round(durationS * TARGET_FPS));

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
  const blob = new Blob([gif.bytes()], { type: "image/gif" });
  if (blob.size > 5 * 1024 * 1024) {
    throw new Error("Le GIF généré dépasse 5 Mo. Essayez un extrait plus court.");
  }
  return blob;
}

export async function videoToGif(
  video: HTMLVideoElement,
  startS: number,
  endS: number,
): Promise<Blob> {
  const { frames, width, height } = await extractFrames(video, startS, endS);
  return encodeGif(frames, width, height);
}
