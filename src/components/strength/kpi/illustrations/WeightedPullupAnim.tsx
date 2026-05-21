/**
 * WeightedPullupAnim — silhouette suspendue à la barre fixe qui exécute
 * une traction lestée stricte (cycle 2.0s).
 *
 * Phases : bras tendus en bas → tirage menton au-dessus de la barre
 * (translateY -30px du corps, bras se plient) → descente contrôlée.
 * Ceinture de lest visible à la hanche.
 */
export function WeightedPullupAnim() {
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
        @keyframes wp-up {
          0%, 15%   { transform: translateY(0); }
          50%       { transform: translateY(-30px); }
          85%, 100% { transform: translateY(0); }
        }
        @keyframes wp-arms-bend {
          0%, 15%   { stroke-width: 2.5; }
          50%       { stroke-width: 3; }
          85%, 100% { stroke-width: 2.5; }
        }
        .wp-body { animation: wp-up 2s ease-in-out infinite; }
      `}</style>
      {/* Plafond / fixation */}
      <line x1="80" y1="32" x2="240" y2="32" strokeWidth="2" opacity="0.5" />
      <line x1="120" y1="32" x2="120" y2="48" strokeWidth="2" opacity="0.5" />
      <line x1="200" y1="32" x2="200" y2="48" strokeWidth="2" opacity="0.5" />
      {/* Barre fixe */}
      <line x1="100" y1="48" x2="220" y2="48" strokeWidth="3" />
      {/* Sol */}
      <line x1="40" y1="170" x2="280" y2="170" strokeWidth="2" opacity="0.5" />

      {/* Silhouette + ceinture de lest */}
      <g className="wp-body">
        {/* Bras suspendus à la barre (mains fixes en haut) */}
        <line x1="140" y1="48" x2="148" y2="92" strokeWidth="2.5" />
        <line x1="180" y1="48" x2="172" y2="92" strokeWidth="2.5" />
        {/* Tête */}
        <circle cx="160" cy="98" r="9" strokeWidth="2.5" />
        {/* Tronc */}
        <line x1="160" y1="107" x2="160" y2="138" strokeWidth="2.5" />
        {/* Ceinture lest */}
        <rect x="145" y="135" width="30" height="7" strokeWidth="2" rx="1.5" />
        {/* Disque suspendu */}
        <line x1="160" y1="142" x2="160" y2="152" strokeWidth="1.5" opacity="0.7" />
        <circle cx="160" cy="158" r="6" strokeWidth="2" />
        {/* Jambes */}
        <line x1="160" y1="142" x2="150" y2="165" strokeWidth="2.5" />
        <line x1="160" y1="142" x2="170" y2="165" strokeWidth="2.5" />
      </g>
    </svg>
  );
}
