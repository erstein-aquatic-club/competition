type StyleEntry = [property: string, value: string];
type StyleSnapshot = StyleEntry[];

const CAPTURE_ATTR = "data-html2canvas-capture-id";
const UNSUPPORTED_COLOR_RE = /\b(?:oklab|oklch|color-mix)\(/i;

function normalizePossiblyUnsupportedValue(
  resolver: HTMLElement,
  property: string,
  value: string,
): string | null {
  if (!UNSUPPORTED_COLOR_RE.test(value)) return value;

  resolver.style.setProperty(property, "");
  resolver.style.setProperty(property, value);
  const normalized = window.getComputedStyle(resolver).getPropertyValue(property).trim();
  resolver.style.removeProperty(property);
  if (normalized && !UNSUPPORTED_COLOR_RE.test(normalized)) return normalized;

  // Fallback: try to coerce as plain color token.
  resolver.style.setProperty("color", "");
  resolver.style.setProperty("color", value);
  const normalizedColor = window.getComputedStyle(resolver).color.trim();
  resolver.style.removeProperty("color");
  if (normalizedColor && !UNSUPPORTED_COLOR_RE.test(normalizedColor)) return normalizedColor;

  // Last resort: skip this property to avoid html2canvas parser crash.
  return null;
}

function snapshotComputedStyle(node: HTMLElement, resolver: HTMLElement): StyleSnapshot {
  const style = window.getComputedStyle(node);
  const entries: StyleSnapshot = [];

  for (let i = 0; i < style.length; i += 1) {
    const property = style[i];
    // Skip CSS variables to avoid re-injecting unresolved modern functions.
    if (!property || property.startsWith("--")) continue;
    const value = style.getPropertyValue(property);
    if (!value) continue;
    const normalized = normalizePossiblyUnsupportedValue(resolver, property, value);
    if (normalized == null) continue;
    entries.push([property, normalized]);
  }

  return entries;
}

function applyComputedStyle(node: HTMLElement, snapshot: StyleSnapshot): void {
  for (const [property, value] of snapshot) {
    node.style.setProperty(property, value);
  }
}

/**
 * html2canvas can fail on Tailwind v4 color functions (oklab/color-mix).
 * To avoid parser errors, we inline fully computed styles on the cloned subtree.
 */
export function buildHtml2CanvasOnClone(
  sourceRoot: HTMLElement,
  options?: { showSelector?: string; stripStylesheets?: boolean },
): { onclone: (clonedDocument: Document) => void; cleanup: () => void } {
  const captureId = `h2c-${Math.random().toString(36).slice(2)}`;
  sourceRoot.setAttribute(CAPTURE_ATTR, captureId);

  const resolver = document.createElement("div");
  resolver.style.position = "fixed";
  resolver.style.left = "-99999px";
  resolver.style.top = "-99999px";
  resolver.style.pointerEvents = "none";
  document.body.appendChild(resolver);

  const sourceNodes = [
    sourceRoot,
    ...Array.from(sourceRoot.querySelectorAll<HTMLElement>("*")),
  ];
  const snapshots = sourceNodes.map((node) => snapshotComputedStyle(node, resolver));
  resolver.remove();
  const showSelector = options?.showSelector ?? ".export-visible";
  const stripStylesheets = options?.stripStylesheets ?? true;

  const onclone = (clonedDocument: Document) => {
    const clonedRoot = clonedDocument.querySelector<HTMLElement>(
      `[${CAPTURE_ATTR}="${captureId}"]`,
    );
    if (!clonedRoot) return;

    if (stripStylesheets) {
      clonedDocument
        .querySelectorAll("style, link[rel='stylesheet']")
        .forEach((node) => node.remove());
    }

    const clonedNodes = [
      clonedRoot,
      ...Array.from(clonedRoot.querySelectorAll<HTMLElement>("*")),
    ];
    const count = Math.min(clonedNodes.length, snapshots.length);
    for (let i = 0; i < count; i += 1) {
      applyComputedStyle(clonedNodes[i], snapshots[i]);
    }

    if (showSelector) {
      clonedRoot.querySelectorAll<HTMLElement>(showSelector).forEach((node) => {
        node.style.display = "block";
      });
    }
  };

  const cleanup = () => {
    sourceRoot.removeAttribute(CAPTURE_ATTR);
  };

  return { onclone, cleanup };
}
