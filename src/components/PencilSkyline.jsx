import React from 'react';

/**
 * A coloured-pencil sketch of a skyline with palms and a low sun, drawn in
 * SVG rather than shipped as a photo: it stays sharp at any width, adds no
 * asset to the bundle, and the wobble filter gives the lines a hand-drawn edge.
 */
const NAVY = '#28417C';
const SKY = '#3b82f6';
const TEAL = '#0d9488';
const ORANGE = '#F15E22';
const GOLD = '#f59e0b';
const GREEN = '#16a34a';

// Diagonal hatching inside a rectangle, the way a pencil fills a shape.
function hatch(x, y, w, h, gap, color) {
  const lines = [];
  for (let d = gap; d < w + h; d += gap) {
    const x1 = Math.max(x, x + d - h);
    const y1 = Math.min(y + h, y + d);
    const x2 = Math.min(x + w, x + d);
    const y2 = Math.max(y, y + d - w);
    lines.push(<line key={`${x}-${y}-${d}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} />);
  }
  return lines;
}

function Palm({ x, base, height, lean, color = GREEN }) {
  const topX = x + lean;
  const topY = base - height;
  const fronds = [[-26, 8], [-18, -6], [-6, -14], [8, -12], [20, -2], [26, 10]];
  return (
    <g fill="none" strokeLinecap="round">
      <path d={`M${x} ${base} Q${x + lean * 0.2} ${base - height * 0.55} ${topX} ${topY}`} stroke="#a16207" strokeWidth="2.2" />
      <path d={`M${x + 3} ${base} Q${x + lean * 0.2 + 3} ${base - height * 0.55} ${topX + 2} ${topY}`} stroke="#ca8a04" strokeWidth="1" opacity="0.7" />
      {fronds.map(([dx, dy], i) => (
        <path
          key={i}
          d={`M${topX} ${topY} Q${topX + dx * 0.6} ${topY + dy - 10} ${topX + dx} ${topY + dy}`}
          stroke={i % 2 ? color : TEAL}
          strokeWidth="1.8"
        />
      ))}
    </g>
  );
}

export default function PencilSkyline({ className = '' }) {
  return (
    <svg viewBox="0 0 520 190" className={className} preserveAspectRatio="xMaxYMax meet" aria-hidden="true">
      <defs>
        <filter id="pencil-wobble" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.6" />
        </filter>
        <linearGradient id="pencil-fade" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.28" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id="pencil-mask">
          <rect width="520" height="190" fill="url(#pencil-fade)" />
        </mask>
      </defs>

      <g mask="url(#pencil-mask)" filter="url(#pencil-wobble)" strokeLinecap="round" strokeLinejoin="round">
        {/* Low sun, scribbled in two colours */}
        <g fill="none" strokeWidth="1.3" opacity="0.85">
          <circle cx="430" cy="62" r="24" stroke={GOLD} />
          <circle cx="430" cy="62" r="18" stroke={ORANGE} opacity="0.6" />
          {[...Array(12)].map((_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <line key={i} x1={430 + Math.cos(a) * 29} y1={62 + Math.sin(a) * 29} x2={430 + Math.cos(a) * 38} y2={62 + Math.sin(a) * 38} stroke={GOLD} />;
          })}
          {hatch(414, 46, 32, 32, 5, ORANGE)}
        </g>

        {/* Long modern building with a roof sweep */}
        <g fill="none" strokeWidth="1.5" opacity="0.9">
          <path d="M150 168V98h170v70" stroke={NAVY} />
          <path d="M142 98Q235 66 330 98" stroke={ORANGE} strokeWidth="2" />
          <path d="M150 112h170" stroke={NAVY} opacity="0.5" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <rect key={i} x={160 + i * 20} y="120" width="12" height="30" stroke={SKY} />
          ))}
          <g strokeWidth="1" opacity="0.55">{hatch(150, 98, 170, 14, 6, NAVY)}</g>
          <g strokeWidth="0.9" opacity="0.5">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => hatch(160 + i * 20, 120, 12, 30, 5, SKY))}</g>
        </g>

        {/* Tower on the right */}
        <g fill="none" strokeWidth="1.5" opacity="0.9">
          <path d="M338 168V70l22-18 22 18v98" stroke={TEAL} />
          {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M346 ${84 + i * 14}h28`} stroke={TEAL} opacity="0.55" />)}
          <g strokeWidth="0.9" opacity="0.4">{hatch(338, 70, 44, 98, 7, TEAL)}</g>
        </g>

        {/* Smaller block on the left */}
        <g fill="none" strokeWidth="1.5" opacity="0.9">
          <path d="M96 168v-44h44v44" stroke={ORANGE} />
          <path d="M96 124h44" stroke={ORANGE} opacity="0.5" />
          <g strokeWidth="0.9" opacity="0.45">{hatch(96, 124, 44, 44, 6, ORANGE)}</g>
        </g>

        {/* Palms */}
        <Palm x={78} base={168} height={64} lean={-8} />
        <Palm x={406} base={168} height={78} lean={10} />
        <Palm x={462} base={168} height={56} lean={6} color={TEAL} />

        {/* Ground, doubled so it reads as a hand-drawn line */}
        <path d="M40 168H505" stroke={NAVY} strokeWidth="1.4" fill="none" opacity="0.75" />
        <path d="M60 172H490" stroke={SKY} strokeWidth="1" fill="none" opacity="0.5" />
      </g>
    </svg>
  );
}

/** A small sketch tile for a facility row, in place of a photo. */
const TILE_COLOURS = [
  { bg: 'bg-sky-50', border: 'border-sky-200', stroke: SKY, accent: ORANGE },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', stroke: TEAL, accent: GOLD },
  { bg: 'bg-orange-50', border: 'border-orange-200', stroke: ORANGE, accent: NAVY },
  { bg: 'bg-violet-50', border: 'border-violet-200', stroke: '#7c3aed', accent: ORANGE }
];

export function SketchThumb({ seed = '' }) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const c = TILE_COLOURS[h % TILE_COLOURS.length];
  const tall = 22 + (h % 5) * 3;
  return (
    <span className={`w-12 h-10 rounded-lg ${c.bg} border ${c.border} flex items-end justify-center shrink-0 overflow-hidden`}>
      <svg viewBox="0 0 48 40" className="w-full h-full" aria-hidden="true">
        <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4">
          <path d={`M8 34V${34 - tall + 6}h12v${tall - 6}`} stroke={c.stroke} />
          <path d={`M22 34V${34 - tall - 4}h13v${tall + 4}`} stroke={c.stroke} />
          <path d={`M37 34V${34 - tall + 10}h6v${tall - 10}`} stroke={c.accent} />
          <path d="M4 34h40" stroke={c.stroke} opacity="0.7" />
          <path d={`M11 ${34 - tall + 11}h6M11 ${34 - tall + 16}h6M25 ${34 - tall + 2}h7M25 ${34 - tall + 8}h7`} stroke={c.accent} strokeWidth="1" />
        </g>
      </svg>
    </span>
  );
}
