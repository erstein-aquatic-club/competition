/**
 * BroadJumpAnim — silhouette qui saute en longueur (cycle 2.0s).
 *
 * Phases : pieds joints debout → flexion bras vers l'arrière → propulsion
 * avant en arc parabolique → réception 60px plus loin. Trace pointillée
 * de la trajectoire visible en fond.
 */
export function BroadJumpAnim() {
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
        @keyframes bj-jump {
          0%, 15%   { transform: translate(0, 0) scaleY(1); }
          25%       { transform: translate(0, 10px) scaleY(0.85); }
          40%       { transform: translate(35px, -28px) scaleY(1); }
          55%       { transform: translate(75px, -10px) scaleY(1); }
          70%       { transform: translate(110px, 6px) scaleY(0.9); }
          85%, 100% { transform: translate(110px, 0) scaleY(1); }
        }
        .bj-body { animation: bj-jump 2s ease-in-out infinite; transform-origin: 90px 160px; }
        @keyframes bj-reset {
          0%, 85%   { opacity: 1; }
          90%       { opacity: 0; }
          100%      { opacity: 1; }
        }
        .bj-body { animation: bj-jump 2s ease-in-out infinite, bj-reset 2s ease-in-out infinite; }
      `}</style>
      {/* Sol */}
      <line x1="20" y1="160" x2="300" y2="160" strokeWidth="2" />
      {/* Ligne de départ */}
      <line x1="80" y1="156" x2="80" y2="168" strokeWidth="2" opacity="0.6" />
      {/* Trajectoire fantôme */}
      <path
        d="M 90 158 Q 145 100 200 158"
        strokeWidth="1.5"
        strokeDasharray="3 4"
        opacity="0.25"
      />
      {/* Silhouette */}
      <g className="bj-body">
        <circle cx="90" cy="60" r="10" strokeWidth="2.5" />
        <line x1="90" y1="70" x2="90" y2="115" strokeWidth="2.5" />
        {/* Bras pour propulsion */}
        <line x1="90" y1="82" x2="74" y2="105" strokeWidth="2.5" />
        <line x1="90" y1="82" x2="106" y2="105" strokeWidth="2.5" />
        {/* Jambes */}
        <line x1="90" y1="115" x2="80" y2="158" strokeWidth="2.5" />
        <line x1="90" y1="115" x2="100" y2="158" strokeWidth="2.5" />
      </g>
    </svg>
  );
}
