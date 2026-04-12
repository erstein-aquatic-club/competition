type StyleEntry = [property: string, value: string];
type StyleSnapshot = StyleEntry[];

const CAPTURE_ATTR = "data-html2canvas-capture-id";

function snapshotComputedStyle(node: HTMLElement): StyleSnapshot {
  const style = window.getComputedStyle(node);
  const entries: StyleSnapshot = [];

  for (let i = 0; i < style.length; i += 1) {
    const property = style[i];
    // Skip CSS variables to avoid re-injecting unresolved modern functions.
    if (!property || property.startsWith("--")) continue;
    const value = style.getPropertyValue(property);
    if (!value) continue;
    entries.push([property, value]);
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

  const sourceNodes = [
    sourceRoot,
    ...Array.from(sourceRoot.querySelectorAll<HTMLElement>("*")),
  ];
  const snapshots = sourceNodes.map(snapshotComputedStyle);
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
