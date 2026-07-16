// Clean side-view car silhouettes per body type (inline SVG — always render,
// no external images). Distinguished by roofline/proportions.
const SHAPES = {
  SUV: { roof: '48,36 53,16 112,16 118,36', glass: ['57,19 83,19 83,33 57,33', '87,19 110,19 110,33 87,33'] },
  Pickup: { roof: '40,36 46,19 78,19 84,36', glass: ['50,22 74,22 74,33 50,33'], bed: '88,29 132,29 132,36 88,36' },
  'Sedán': { roof: '48,36 63,19 98,19 111,36', glass: ['59,22 83,22 82,33 61,33', '86,22 104,22 106,33 86,33'] },
  'Coupé': { roof: '52,36 76,20 100,22 110,36', glass: ['63,24 96,23 100,33 68,33'] },
  Minivan: { roof: '38,36 42,14 122,14 126,36', glass: ['46,17 82,17 82,33 46,33', '86,17 120,17 120,33 86,33'] },
  Hatchback: { roof: '46,36 57,18 97,18 107,36', glass: ['55,21 80,21 80,33 55,33', '84,21 102,21 106,33 84,33'] },
  Convertible: { windshield: '56,36 64,24 74,36' },
  Wagon: { roof: '46,36 57,17 120,17 125,34', glass: ['55,20 85,20 85,33 55,33', '89,20 118,20 118,33 89,33'] },
}

export default function BodyTypeIcon({ type }) {
  const s = SHAPES[type] || SHAPES.SUV
  const body = '#e2e8f0'
  const glass = 'rgba(15,23,42,0.13)'
  return (
    <svg viewBox="0 0 150 66" className="bt-icon" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
      <ellipse cx="76" cy="60" rx="60" ry="4" fill="#0f172a" opacity="0.06" />
      <path d="M12 45 C12 39 16 36 24 36 L126 36 C135 36 138 39 138 45 L138 47 C138 51 135 52 131 52 L19 52 C15 52 12 50 12 46 Z" fill={body} />
      {s.roof && <polygon points={s.roof} fill={body} />}
      {s.bed && <polygon points={s.bed} fill={body} />}
      {s.windshield && <polygon points={s.windshield} fill="none" stroke={glass} strokeWidth="3.5" strokeLinejoin="round" />}
      {(s.glass || []).map((g, i) => <polygon key={i} points={g} fill={glass} />)}
      <circle cx="45" cy="50" r="11" fill="#3a4656" /><circle cx="45" cy="50" r="4.5" fill="#d7dee7" />
      <circle cx="112" cy="50" r="11" fill="#3a4656" /><circle cx="112" cy="50" r="4.5" fill="#d7dee7" />
    </svg>
  )
}
