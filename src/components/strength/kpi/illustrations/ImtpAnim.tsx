/**
 * ImtpAnim — silhouette qui tire une barre posée sur les pins du rack
 * à hauteur mi-cuisse, sur 1 répétition complète (cycle 1.8s).
 *
 * Phases : départ mains sur barre au rack mi-cuisse → tirage explosif
 * extension hanches (barre monte ~20px, tronc se redresse) → repose.
 */
export function ImtpAnim() {
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
        @keyframes imtp-pull {
          0%, 15%  { transform: translateY(0); }
          50%      { transform: translateY(-20px); }
          85%, 100% { transform: translateY(0); }
        }
        @keyframes imtp-torso {
          0%, 15%  { transform: rotate(0deg); }
          50%      { transform: rotate(12deg); }
          85%, 100% { transform: rotate(0deg); }
        }
        .imtp-bar  { animation: imtp-pull 1.8s ease-in-out infinite; }
        .imtp-arms { animation: imtp-pull 1.8s ease-in-out infinite; }
        .imtp-torso { animation: imtp-torso 1.8s ease-in-out infinite; transform-origin: 160px 145px; }
      `}</style>
      {/* Sol */}
      <line x1="40" y1="170" x2="280" y2="170" strokeWidth="2" />
      {/* Rack (poteaux + pins mi-cuisse) */}
      <line x1="100" y1="170" x2="100" y2="60"  strokeWidth="2" opacity="0.6" />
      <line x1="220" y1="170" x2="220" y2="60"  strokeWidth="2" opacity="0.6" />
      <line x1="95"  y1="120" x2="105" y2="120" strokeWidth="2" opacity="0.6" />
      <line x1="215" y1="120" x2="225" y2="120" strokeWidth="2" opacity="0.6" />
      {/* Silhouette (tronc + tête tournent légèrement à la traction) */}
      <g className="imtp-torso">
        <circle cx="160" cy="68" r="10" strokeWidth="2.5" />
        <line x1="160" y1="78" x2="160" y2="125" strokeWidth="2.5" />
      </g>
      {/* Bras + barre (montent ensemble) */}
      <g className="imtp-arms">
        <line x1="160" y1="90"  x2="135" y2="120" strokeWidth="2.5" />
        <line x1="160" y1="90"  x2="185" y2="120" strokeWidth="2.5" />
        {/* Barre + disques */}
        <line x1="115" y1="120" x2="205" y2="120" strokeWidth="3" />
        <line x1="115" y1="108" x2="115" y2="132" strokeWidth="3.5" />
        <line x1="205" y1="108" x2="205" y2="132" strokeWidth="3.5" />
      </g>
      {/* Jambes (fixes, ancrées au sol) */}
      <line x1="160" y1="125" x2="146" y2="168" strokeWidth="2.5" />
      <line x1="160" y1="125" x2="174" y2="168" strokeWidth="2.5" />
    </svg>
  );
}
