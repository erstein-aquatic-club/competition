// ────────────────────────────────────────────────────────────────────────────
// swimTextParser.ts — Deterministic text → SwimBlock[] parser
// ────────────────────────────────────────────────────────────────────────────
import { stripAccents } from "@/lib/utils";

// ── Shared normalizers (extracted from SwimCatalog / SwimExerciseForm / SwimSessionBuilder) ──

const legacyIntensityMap: Record<string, string> = {
  souple: "V0",
  facile: "V0",
  relache: "V0",
  "relâché": "V0",
  ez: "V0",
};

const intensityScale = ["V0", "V1", "V2", "V3", "Max", "Prog"] as const;

export const normalizeIntensityValue = (value?: string | null): string => {
  if (!value) return "V0";
  const trimmed = value.trim();
  if (!trimmed) return "V0";
  const lower = trimmed.toLowerCase();
  if (lower === "prog" || lower === "progressif") return "Prog";
  if (legacyIntensityMap[lower]) {
    return legacyIntensityMap[lower];
  }
  const upper = trimmed.toUpperCase();
  if (upper === "MAX" || upper === "VMAX") return "Max";
  if (upper.startsWith("V")) {
    const levelValue = Number.parseInt(upper.slice(1), 10);
    if (Number.isFinite(levelValue) && levelValue >= 4) {
      return "Max";
    }
    if (intensityScale.includes(upper as (typeof intensityScale)[number])) {
      return upper;
    }
  }
  return trimmed;
};

export const normalizeEquipmentValue = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("plaquette") || trimmed.startsWith("plaq")) return "plaquettes";
  if (trimmed.startsWith("palm")) return "palmes";
  if (trimmed.startsWith("tuba")) return "tuba";
  if (trimmed.startsWith("pull")) return "pull";
  if (trimmed.startsWith("elas")) return "elastique";
  return trimmed;
};

// ── Types ──

export interface SwimExercise {
  repetitions: number | null;
  distance: number | null;
  rest: number | null;
  restType: "departure" | "rest";
  stroke: string;
  strokeType: string;
  intensity: string;
  modalities: string;
  equipment: string[];
}

export interface SwimBlock {
  title: string;
  repetitions: number | null;
  description: string;
  modalities: string;
  equipment: string[];
  exercises: SwimExercise[];
}

// ── Line classification ──

export type LineType =
  | "empty"
  | "block_rep"
  | "exercise"
  | "sub_detail"
  | "continuation"
  | "annotation"
  | "unparsed";

export interface ClassifiedLine {
  type: LineType;
  raw: string;
  trimmed: string;
}

export function classifyLine(raw: string): ClassifiedLine {
  const trimmed = raw.trim();

  if (!trimmed) return { type: "empty", raw, trimmed };

  // block_rep: x2, x3, x2 (...) — must start with x followed by digit
  if (/^x\d+/i.test(trimmed)) return { type: "block_rep", raw, trimmed };

  // sub_detail: starts with #
  if (trimmed.startsWith("#")) return { type: "sub_detail", raw, trimmed };

  // continuation: starts with +
  if (trimmed.startsWith("+")) return { type: "continuation", raw, trimmed };

  // annotation: S1 :, B1 :, S2 :, B2 : etc.
  if (/^[SB]\d+\s*:/i.test(trimmed)) return { type: "annotation", raw, trimmed };

  // exercise: starts with a digit
  if (/^\d/.test(trimmed)) return { type: "exercise", raw, trimmed };

  // "Total :" line — skip
  if (/^total\s*:/i.test(trimmed)) return { type: "unparsed", raw, trimmed };

  return { type: "unparsed", raw, trimmed };
}

// ── Rest / departure parsing ──

/** Parse time notation like 10'', 1'00, 1'45, 60'', 30'' → seconds */
export function parseTimeNotation(s: string): number | null {
  // Try min'sec format: 1'00, 1'45, 2'10
  const minSec = s.match(/(\d+)'(\d+)/);
  if (minSec) {
    return Number(minSec[1]) * 60 + Number(minSec[2]);
  }
  // Try seconds format: 10'', 60'', 30''
  const sec = s.match(/(\d+)(?:''|"|″)/);
  if (sec) {
    return Number(sec[1]);
  }
  // Plain number fallback
  const plain = s.match(/^(\d+)$/);
  if (plain) {
    return Number(plain[1]);
  }
  return null;
}

export interface RestResult {
  rest: number;
  restType: "departure" | "rest";
}

/** Extract rest or departure from token sequence */
export function parseRestToken(tokens: string[]): RestResult | null {
  const text = tokens.join(" ");

  // Departure: @ 60'', @ 1'45, d : 1'50
  const depMatch =
    text.match(/@\s*([\d''"″]+(?:\s*\/\s*[\d''"″]+)?)/) ||
    text.match(/\bd\s*:\s*([\d''"″]+(?:\s*\/\s*[\d''"″]+)?)/);
  if (depMatch) {
    const timeStr = depMatch[1].split("/")[0].trim();
    const seconds = parseTimeNotation(timeStr);
    if (seconds !== null) return { rest: seconds, restType: "departure" };
  }

  // Rest: r : 10'', r : 1'00, r :20''
  const restMatch = text.match(/\br\s*:\s*([\d''"″]+(?:\s*\/\s*[\d''"″]+)?)/);
  if (restMatch) {
    const timeStr = restMatch[1].split("/")[0].trim();
    const seconds = parseTimeNotation(timeStr);
    if (seconds !== null) return { rest: seconds, restType: "rest" };
  }

  return null;
}

// ── Exercise token parsing ──


// Stroke keywords (order matters: longer patterns first)
// All patterns use ASCII — input is stripped of accents before matching
const STROKE_MAP: [RegExp, string][] = [
  [/\b4n\b/i, "4n"],
  [/\bqn\b/i, "4n"],
  [/\bcrawl\b/i, "crawl"],
  [/\bcr\b/i, "crawl"],
  [/\bnl\b/i, "crawl"],
  [/\bpapillon\b/i, "pap"],
  [/\bpap\b/i, "pap"],
  [/\bdos\b/i, "dos"],
  [/\b[dD]\b/, "dos"], // single D = dos, but only uppercase or explicit
  [/\bbrasse\b/i, "brasse"],
  [/\bbr\b/i, "brasse"],
  [/\bspe\b/i, "spe"],
];

// Stroke-type keywords
const STROKE_TYPE_MAP: [RegExp, string][] = [
  [/\beduc\b/i, "educ"],
  [/\bjbes\b/i, "jambes"],
  [/\bjambes\b/i, "jambes"],
  [/\bnac\b/i, "nc"],
  [/\bnc\b/i, "nc"],
];

// Intensity keywords
const INTENSITY_MAP: [RegExp, string][] = [
  [/\bvmax\b/i, "Max"],
  [/\bmax\b/i, "Max"],
  [/\bvacc\b/i, "Max"],
  [/\bv3\b/i, "V3"],
  [/\bv2\b/i, "V2"],
  [/\bv1\b/i, "V1"],
  [/\bv0\b/i, "V0"],
  [/\bez\b/i, "V0"],
  [/\bsouple\b/i, "V0"],
  [/\bprog\b/i, "Prog"],
];

// Equipment keywords
const EQUIPMENT_MAP: [RegExp, string][] = [
  [/\bplaq(?:uettes?)?\b/i, "plaquettes"],
  [/\bpalm(?:es)?\b/i, "palmes"],
  [/\btuba\b/i, "tuba"],
  [/\bpull\b/i, "pull"],
  [/\belas(?:tique)?\b/i, "elastique"],
];

// Tokens that should NOT be mistaken for strokes (D2B, DP, etc.)
const PROTECTED_TOKENS = /\b(?:D2B|DP|CB|R2N|AC|CP|RA)\b/i;

// Modality keywords — known modalities that go to modalities field
const MODALITY_PATTERNS = [
  /\bW\b/,
  /\bmat\.\s*\w+/i,
  /\bDP\b/,
  /\bCB\b/,
  /\bR2N\b/,
  /\bD2B\b/,
  /\bampli\b/i,
  /\bAC\b/,
  /\bCP\b/,
  /\bRA\b/,
  /\b1\/2\s*pull\b/i,
  /\bfocus\b/i,
];

export interface ExerciseTokens {
  repetitions: number;
  distance: number | null;
  stroke: string;
  strokeType: string;
  intensity: string;
  rest: number | null;
  restType: "departure" | "rest";
  equipment: string[];
  modalities: string;
}

/** Clean a token string for matching — remove rest/departure parts first */
function removeRestParts(text: string): string {
  return text
    .replace(/\br\s*:\s*[\d''"″\/\s]+/g, " ")
    .replace(/@\s*[\d''"″\/\s]+/g, " ")
    .replace(/\bd\s*:\s*[\d''"″\/\s]+/g, " ");
}

export function parseExerciseTokens(text: string): ExerciseTokens {
  const result: ExerciseTokens = {
    repetitions: 1,
    distance: null,
    stroke: "crawl",
    strokeType: "nc",
    intensity: "V1",
    rest: null,
    restType: "rest",
    equipment: [],
    modalities: "",
  };

  // 1. Parse rest/departure first (before removing parts)
  const restResult = parseRestToken(text.split(/\s+/));
  if (restResult) {
    result.rest = restResult.rest;
    result.restType = restResult.restType;
  }

  // Remove rest/departure notation for further parsing
  const cleaned = removeRestParts(text);
  // Strip accents for keyword matching (é→e, etc.)
  const ascii = stripAccents(cleaned);

  // 2. Parse reps × distance: 3*100, 4x50, 8×25
  const repsDistMatch = cleaned.match(/(\d+)\s*[*x×]\s*(\d+)/i);
  if (repsDistMatch) {
    result.repetitions = Number(repsDistMatch[1]);
    result.distance = Number(repsDistMatch[2]);
  } else {
    // Distance alone: starts with a number
    const distMatch = cleaned.match(/^(\d+)\b/);
    if (distMatch) {
      result.distance = Number(distMatch[1]);
    }
  }

  // 3. Check for progressive intensity: V1↗, ↗
  if (/↗|↗︎/.test(text)) {
    result.intensity = "Prog";
  }

  // 4. Protect D2B/DP/CB/R2N/AC/CP tokens from being parsed as strokes
  const protectedZones = new Set<number>();
  const protectedRegex = /\b(?:D2B|DP|CB|R2N|AC|CP|RA)\b/gi;
  let pMatch;
  while ((pMatch = protectedRegex.exec(ascii)) !== null) {
    for (let i = pMatch.index; i < pMatch.index + pMatch[0].length; i++) {
      protectedZones.add(i);
    }
  }

  // Helper: check token match is not in a protected zone
  const isProtected = (match: RegExpExecArray) => {
    for (let i = match.index; i < match.index + match[0].length; i++) {
      if (protectedZones.has(i)) return true;
    }
    return false;
  };

  // 5. Extract intensity (first match wins, skip if already set by ↗)
  if (result.intensity !== "Prog") {
    for (const [pattern, value] of INTENSITY_MAP) {
      const re = new RegExp(pattern.source, pattern.flags + (pattern.flags.includes("g") ? "" : ""));
      const m = re.exec(ascii);
      if (m && !isProtected(m)) {
        result.intensity = value;
        break;
      }
    }
  }

  // 6. Extract stroke (use ascii-normalized text for matching)
  for (const [pattern, value] of STROKE_MAP) {
    const re = new RegExp(pattern.source, pattern.flags);
    const m = re.exec(ascii);
    if (m && !isProtected(m)) {
      // Special case: single "D" — only match if it's uppercase and stands alone
      if (value === "dos" && pattern.source === "\\b[dD]\\b") {
        if (m[0] !== "D") continue;
      }
      result.stroke = value;
      break;
    }
  }

  // 7. Extract stroke type (use ascii-normalized text)
  for (const [pattern, value] of STROKE_TYPE_MAP) {
    if (pattern.test(ascii)) {
      result.strokeType = value;
      break;
    }
  }

  // 8. Extract equipment (use ascii-normalized text)
  for (const [pattern, value] of EQUIPMENT_MAP) {
    if (pattern.test(ascii)) {
      if (!result.equipment.includes(value)) {
        result.equipment.push(value);
      }
    }
  }

  // 9. Collect modalities — W ..., mat. AC, DP, CB, R2N, D2B, ampli, and other unrecognized tokens
  const modParts: string[] = [];

  // Capture "W ..." segments
  const wMatch = cleaned.match(/\bW\s+[^\r\n]+/i);
  if (wMatch) {
    modParts.push(wMatch[0].trim());
  }

  // Capture "mat. AC" style
  const matMatch = cleaned.match(/\bmat\.\s*\w+/i);
  if (matMatch) {
    modParts.push(matMatch[0].trim());
  }

  // Capture standalone modality tokens
  for (const p of MODALITY_PATTERNS) {
    if (p.source.startsWith("\\bW\\b") || p.source.startsWith("\\bmat")) continue; // already handled
    const m = cleaned.match(p);
    if (m) {
      const token = m[0].trim();
      if (!modParts.some((mp) => mp.includes(token))) {
        modParts.push(token);
      }
    }
  }

  // Capture parenthesized content as modalities: (100 Cr / 100 D pull)
  const parenMatch = text.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const parenContent = parenMatch[1].trim();
    // If it's a parenthesized content that contains stroke info, add as modality
    if (parenContent.length > 2 && !modParts.some((mp) => mp.includes(parenContent))) {
      modParts.push(`(${parenContent})`);
    }
  }

  // Capture "respi ..." annotations
  const respiMatch = cleaned.match(/\brespi\s+[\d\-]+\s*(?:temps)?/i);
  if (respiMatch) {
    modParts.push(respiMatch[0].trim());
  }

  result.modalities = modParts.join(" / ").trim();

  return result;
}

// ── Sub-detail parsing ──

interface SubDetailFormA {
  form: "A";
  distance: number;
  tokens: ExerciseTokens;
}

interface SubDetailFormB {
  form: "B";
  text: string;
}

type SubDetailResult = SubDetailFormA | SubDetailFormB;

function parseSubDetail(trimmed: string): SubDetailResult {
  // Remove leading #
  const content = trimmed.replace(/^#\s*/, "");

  // Form B heuristic: #1 : ..., #1-3 : ..., #1-8 : ...
  if (/^\d+(?:-\d+)?\s*[:(\s]/.test(content)) {
    // Check if it's really Form B (annotation) vs Form A with parens
    // Form B: #1 : NAC V0, #1-3 : jbes V1
    if (/^\d+(?:-\d+)?\s*:/.test(content)) {
      return { form: "B", text: content.trim() };
    }
    // #1 (25 traction BD / ...) — Form B with parens
    if (/^\d+\s*\(/.test(content)) {
      return { form: "B", text: content.trim() };
    }
  }

  // Form A: #150 Cr, #50 D, #25 Educ, #75 EZ, #25 VMax spé
  const distMatch = content.match(/^(\d+)\b/);
  if (distMatch) {
    const tokens = parseExerciseTokens(content);
    return {
      form: "A",
      distance: Number(distMatch[1]),
      tokens,
    };
  }

  // Fallback to Form B
  return { form: "B", text: content.trim() };
}

// ── Block assembly ──

function makeDefaultExercise(): SwimExercise {
  return {
    repetitions: 1,
    distance: null,
    rest: null,
    restType: "rest",
    stroke: "crawl",
    strokeType: "nc",
    intensity: "V1",
    modalities: "",
    equipment: [],
  };
}

function tokensToExercise(tokens: ExerciseTokens): SwimExercise {
  return {
    repetitions: tokens.repetitions,
    distance: tokens.distance,
    rest: tokens.rest,
    restType: tokens.restType,
    stroke: tokens.stroke,
    strokeType: tokens.strokeType,
    intensity: tokens.intensity,
    modalities: tokens.modalities,
    equipment: tokens.equipment,
  };
}

interface RawBlock {
  lines: ClassifiedLine[];
}

function splitIntoRawBlocks(lines: ClassifiedLine[]): RawBlock[] {
  const blocks: RawBlock[] = [];
  let current: ClassifiedLine[] = [];

  for (const line of lines) {
    if (line.type === "empty") {
      if (current.length > 0) {
        blocks.push({ lines: current });
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    blocks.push({ lines: current });
  }

  return blocks;
}

function assembleBlock(raw: RawBlock, blockIndex: number): SwimBlock {
  const block: SwimBlock = {
    title: `Bloc ${blockIndex + 1}`,
    repetitions: 1,
    description: "",
    modalities: "",
    equipment: [],
    exercises: [],
  };

  let pendingExercise: ExerciseTokens | null = null;
  let pendingSubDetailsA: string[] = [];
  const descParts: string[] = [];
  const blockModParts: string[] = [];

  /** Flush pending exercise (with collected Form A sub-details as modalities) */
  const flushPending = () => {
    if (pendingExercise) {
      if (pendingSubDetailsA.length > 0) {
        const subText = pendingSubDetailsA.join("\n");
        pendingExercise.modalities = pendingExercise.modalities
          ? `${pendingExercise.modalities}\n${subText}`
          : subText;
      }
      block.exercises.push(tokensToExercise(pendingExercise));
    }
    pendingExercise = null;
    pendingSubDetailsA = [];
  };

  for (let i = 0; i < raw.lines.length; i++) {
    const line = raw.lines[i];

    switch (line.type) {
      case "block_rep": {
        // x2, x3 (...) — extract repetitions and optional modalities in parens
        const repMatch = line.trimmed.match(/^x(\d+)/i);
        if (repMatch) {
          block.repetitions = Math.min(Number(repMatch[1]), 50); // Cap to prevent absurd values
        }
        // Extract parenthesized content after xN as block-level info
        const parenMatch = line.trimmed.match(/\(([^)]+)\)/);
        if (parenMatch) {
          // This is an inline block: x2 (4*200 Cr V0 ...)
          // Parse it as an exercise within this block
          const innerText = parenMatch[1].trim();
          // Check for mat. AC or similar after the parens
          const afterParen = line.trimmed.slice(line.trimmed.indexOf(")") + 1).trim();
          if (afterParen) {
            blockModParts.push(afterParen);
          }
          // Parse the inner text as exercises (may contain + for continuation)
          const innerParts = innerText.split(/\s*\+\s*/);
          for (const part of innerParts) {
            if (/^\d/.test(part.trim())) {
              const tokens = parseExerciseTokens(part.trim());
              block.exercises.push(tokensToExercise(tokens));
            }
          }
          // Also check for block-level modalities after parens
          if (afterParen) {
            block.modalities = afterParen;
          }
        }
        break;
      }

      case "exercise": {
        flushPending();
        pendingExercise = parseExerciseTokens(line.trimmed);
        break;
      }

      case "sub_detail": {
        const detail = parseSubDetail(line.trimmed);
        if (detail.form === "A" && pendingExercise) {
          // Form A: keep parent exercise, collect sub-detail as modality annotation
          const content = line.trimmed.replace(/^#\s*/, "");
          pendingSubDetailsA.push(content);
        } else if (detail.form === "B" && pendingExercise) {
          // Form B: annotations added to parent's modalities
          const existing = pendingExercise.modalities;
          pendingExercise.modalities = existing
            ? `${existing} / ${detail.text}`
            : detail.text;
        } else if (detail.form === "A") {
          // No parent — standalone sub-detail
          const subExercise = tokensToExercise(detail.tokens);
          subExercise.distance = detail.distance;
          block.exercises.push(subExercise);
        } else {
          // Form B without parent — add to description
          descParts.push(detail.text);
        }
        break;
      }

      case "continuation": {
        flushPending();
        // + 200 EZ or + 3*400
        const contContent = line.trimmed.replace(/^\+\s*/, "").trim();
        if (/^\d/.test(contContent)) {
          pendingExercise = parseExerciseTokens(contContent);
        } else {
          descParts.push(contContent);
        }
        break;
      }

      case "annotation": {
        // S1 :, B1 : — add content to description
        descParts.push(line.trimmed);
        break;
      }

      case "unparsed": {
        // Could be a block title or description
        // If it's the first line and no exercises yet, treat as title
        if (i === 0 && block.exercises.length === 0 && !pendingExercise) {
          block.title = line.trimmed;
        } else {
          // Indented lines (start with spaces) as description
          descParts.push(line.trimmed);
        }
        break;
      }
    }
  }

  // Flush last pending exercise
  flushPending();

  // Assemble block-level fields
  if (descParts.length > 0) {
    block.description = descParts.join("\n");
  }
  if (blockModParts.length > 0) {
    block.modalities = blockModParts.join(" / ");
  }

  // Extract block-level equipment from exercises (de-duplicate)
  const allEquip = new Set<string>();
  for (const ex of block.exercises) {
    for (const eq of ex.equipment) allEquip.add(eq);
  }
  block.equipment = Array.from(allEquip);

  return block;
}

// ── Main entry point ──

export function parseSwimText(text: string): SwimBlock[] {
  if (!text || !text.trim()) return [];

  // Guard: reject absurdly long input
  if (text.length > 10000) {
    throw new Error("Le texte de la séance est trop long (max 10 000 caractères).");
  }

  // Phase 1: Normalize
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u2018|\u2019/g, "'") // smart single quotes
    .replace(/\u201C|\u201D/g, '"') // smart double quotes
    .replace(/\u00A0/g, " "); // non-breaking space

  // Phase 2: Classify lines
  const rawLines = normalized.split("\n");
  const classified = rawLines.map((line) => classifyLine(line));

  // Phase 3: Group into raw blocks
  const rawBlocks = splitIntoRawBlocks(classified);

  // Phase 4: Assemble blocks
  const blocks: SwimBlock[] = [];
  let blockIndex = 0;

  for (const raw of rawBlocks) {
    // Skip blocks that are just "Total : ..." or empty unparsed
    const meaningful = raw.lines.filter(
      (l) => l.type !== "unparsed" || !/^total\s*:/i.test(l.trimmed),
    );
    if (meaningful.length === 0) continue;

    // Check if the first line is a block_rep with no parens and the rest is
    // in the NEXT raw block — handle xN blocks that have exercises on separate lines
    const block = assembleBlock({ lines: meaningful }, blockIndex);

    // Only add blocks that have exercises (or meaningful content)
    if (block.exercises.length > 0 || block.description) {
      blocks.push(block);
      blockIndex++;
    }
  }

  // Post-processing: merge standalone xN block_rep lines with the following block
  // This handles the case where "x3" is on its own line followed by a blank line
  // then the exercises
  const merged: SwimBlock[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const current = blocks[i];
    if (
      current.exercises.length === 0 &&
      !current.description &&
      (current.repetitions ?? 1) > 1 &&
      i + 1 < blocks.length
    ) {
      // This is a standalone xN — merge with next block
      const next = blocks[i + 1];
      next.repetitions = current.repetitions;
      // Don't skip — next iteration will add the merged block
    } else {
      merged.push(current);
    }
  }

  // Post-processing validation: warn if input had content but no exercises were parsed
  const nonEmptyBlocks = merged.filter(b => b.exercises.length > 0);
  if (merged.length > 0 && nonEmptyBlocks.length === 0) {
    console.warn('[swimTextParser] No exercises parsed from non-empty input');
  }

  return merged;
}
