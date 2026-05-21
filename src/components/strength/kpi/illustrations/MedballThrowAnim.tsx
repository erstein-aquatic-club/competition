/**
 * MedballThrowAnim — silhouette allongée propulse un médecine-ball
 * verticalement (cycle 2.2s).
 *
 * Phases : allongé bras pliés ballon poitrine → armé → propulsion explosive
 * (bras s'étendent, ballon décolle vers le haut, +50px translateY -50) →
 * retour ballon en main.
 */
export function MedballThrowAnim() {
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
        @keyframes mb-ball {
          0%, 18%   { transform: translateY(0); opacity: 1; }
          30%       { transform: translateY(-20px); opacity: 1; }
          55%       { transform: translateY(-58px); opacity: 1; }
          75%       { transform: translateY(-58px); opacity: 0; }
          78%       { transform: translateY(0); opacity: 0; }
          82%, 100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes mb-arms {
          0%, 18%   { transform: translateY(0); }
          55%       { transform: translateY(-12px); }
          82%, 100% { transform: translateY(0); }
        }
        .mb-ball { animation: mb-ball 2.2s ease-in-out infinite; transform-origin: 160px 70px; }
        .mb-arms { animation: mb-arms 2.2s ease-in-out infinite; transform-origin: 160px 95px; }
      `}</style>
      {/* Sol */}
      <line x1="30" y1="145" x2="290" y2="145" strokeWidth="2" />
      {/* Silhouette allongée — tête à gauche, jambes à droite */}
      {/* Tête */}
      <circle cx="90" cy="118" r="10" strokeWidth="2.5" />
      {/* Tronc horizontal */}
      <line x1="100" y1="118" x2="180" y2="118" strokeWidth="2.5" />
      {/* Jambes (légèrement fléchies pieds au sol) */}
      <line x1="180" y1="118" x2="220" y2="118" strokeWidth="2.5" />
      <line x1="220" y1="118" x2="240" y2="142" strokeWidth="2.5" />
      <line x1="220" y1="118" x2="240" y2="142" strokeWidth="2.5" />
      <line x1="200" y1="118" x2="218" y2="142" strokeWidth="2.5" />
      {/* Bras qui propulsent (montent ensemble) */}
      <g className="mb-arms">
        <line x1="140" y1="118" x2="155" y2="88" strokeWidth="2.5" />
        <line x1="160" y1="118" x2="165" y2="88" strokeWidth="2.5" />
      </g>
      {/* Ballon */}
      <g className="mb-ball">
        <circle cx="160" cy="78" r="12" strokeWidth="2.5" />
        {/* Couture du medball */}
        <line x1="148" y1="78" x2="172" y2="78" strokeWidth="1.5" opacity="0.6" />
        <line x1="160" y1="66" x2="160" y2="90" strokeWidth="1.5" opacity="0.6" />
      </g>
    </svg>
  );
}
