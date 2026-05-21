/**
 * VerticalJumpAnim — silhouette qui saute en détente sèche (cycle 2.5s).
 *
 * Phases : debout (20%) → flexion (30%) → apex saut vertical (50%) → réception
 * (70%) → debout (100%). `stroke="currentColor"` → s'adapte automatiquement
 * au theme (light/dark mode).
 */
export function VerticalJumpAnim() {
  return (
    <svg
      viewBox="0 0 320 180"
      stroke="currentColor"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-full w-full"
      aria-hidden
    >
      <style>{`
        @keyframes vj-jump {
          0%, 18%   { transform: translateY(0)   scaleY(1); }
          28%       { transform: translateY(8px) scaleY(0.85); }
          38%       { transform: translateY(-38px) scaleY(1.05); }
          48%       { transform: translateY(-44px) scaleY(1.05); }
          62%       { transform: translateY(0)   scaleY(1); }
          72%       { transform: translateY(4px) scaleY(0.92); }
          100%      { transform: translateY(0)   scaleY(1); }
        }
        .vj-body { animation: vj-jump 2.5s ease-in-out infinite; transform-origin: 160px 160px; }
      `}</style>
      {/* Sol */}
      <line x1="40" y1="160" x2="280" y2="160" strokeWidth="2" />
      {/* Marques de sol */}
      <line x1="60" y1="162" x2="60" y2="170" strokeWidth="1" opacity="0.4" />
      <line x1="160" y1="162" x2="160" y2="170" strokeWidth="1" opacity="0.4" />
      <line x1="260" y1="162" x2="260" y2="170" strokeWidth="1" opacity="0.4" />
      {/* Silhouette */}
      <g className="vj-body">
        {/* Tête */}
        <circle cx="160" cy="58" r="11" strokeWidth="2.5" />
        {/* Tronc */}
        <line x1="160" y1="69" x2="160" y2="115" strokeWidth="2.5" />
        {/* Bras tendus le long du corps (sans tuck) */}
        <line x1="160" y1="80" x2="140" y2="112" strokeWidth="2.5" />
        <line x1="160" y1="80" x2="180" y2="112" strokeWidth="2.5" />
        {/* Jambes tendues */}
        <line x1="160" y1="115" x2="146" y2="158" strokeWidth="2.5" />
        <line x1="160" y1="115" x2="174" y2="158" strokeWidth="2.5" />
      </g>
    </svg>
  );
}
