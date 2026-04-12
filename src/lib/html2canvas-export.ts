type ColorSnapshot = {
  color: string;
  backgroundColor: string;
  backgroundImage: string;
  borderTopColor: string;
  borderRightColor: string;
  borderBottomColor: string;
  borderLeftColor: string;
  outlineColor: string;
  textDecorationColor: string;
  boxShadow: string;
  textShadow: string;
  fill: string;
  stroke: string;
};

const CAPTURE_ATTR = "data-html2canvas-capture-id";

function snapshotColors(node: HTMLElement): ColorSnapshot {
  const style = window.getComputedStyle(node);
  return {
    color: style.color,
    backgroundColor: style.backgroundColor,
    backgroundImage: style.backgroundImage,
    borderTopColor: style.borderTopColor,
    borderRightColor: style.borderRightColor,
    borderBottomColor: style.borderBottomColor,
    borderLeftColor: style.borderLeftColor,
    outlineColor: style.outlineColor,
    textDecorationColor: style.textDecorationColor,
    boxShadow: style.boxShadow,
    textShadow: style.textShadow,
    fill: style.fill,
    stroke: style.stroke,
  };
}

function applySnapshot(node: HTMLElement, snapshot: ColorSnapshot): void {
  node.style.color = snapshot.color;
  node.style.backgroundColor = snapshot.backgroundColor;
  node.style.backgroundImage = snapshot.backgroundImage;
  node.style.borderTopColor = snapshot.borderTopColor;
  node.style.borderRightColor = snapshot.borderRightColor;
  node.style.borderBottomColor = snapshot.borderBottomColor;
  node.style.borderLeftColor = snapshot.borderLeftColor;
  node.style.outlineColor = snapshot.outlineColor;
  node.style.textDecorationColor = snapshot.textDecorationColor;
  node.style.boxShadow = snapshot.boxShadow;
  node.style.textShadow = snapshot.textShadow;
  if (snapshot.fill && snapshot.fill !== "none") {
    node.style.fill = snapshot.fill;
  }
  if (snapshot.stroke && snapshot.stroke !== "none") {
    node.style.stroke = snapshot.stroke;
  }
}

/**
 * html2canvas cannot parse some modern CSS color functions produced by Tailwind v4
 * (e.g. color-mix(... in oklab ...)).
 *
 * We snapshot resolved colors from the live DOM and apply them inline on the cloned DOM.
 */
export function buildHtml2CanvasOnClone(
  sourceRoot: HTMLElement,
  options?: { showSelector?: string },
): { onclone: (clonedDocument: Document) => void; cleanup: () => void } {
  const captureId = `h2c-${Math.random().toString(36).slice(2)}`;
  sourceRoot.setAttribute(CAPTURE_ATTR, captureId);

  const sourceNodes = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll<HTMLElement>("*"))];
  const snapshots = sourceNodes.map(snapshotColors);
  const showSelector = options?.showSelector ?? ".export-visible";

  const onclone = (clonedDocument: Document) => {
    const clonedRoot = clonedDocument.querySelector<HTMLElement>(`[${CAPTURE_ATTR}="${captureId}"]`);
    if (!clonedRoot) return;

    const clonedNodes = [clonedRoot, ...Array.from(clonedRoot.querySelectorAll<HTMLElement>("*"))];
    const count = Math.min(clonedNodes.length, snapshots.length);
    for (let i = 0; i < count; i += 1) {
      applySnapshot(clonedNodes[i], snapshots[i]);
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
