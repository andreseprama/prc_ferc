// Ícones sóbrios (SVG) para as categorias e ações — substituem os emojis
const PATHS = {
  bancada: 'M3.5 8a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v1.2a2.8 2.8 0 0 0 0 5.6V16a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-1.2a2.8 2.8 0 0 0 0-5.6V8z M13.5 6v12',
  camarote: 'M12 3.5l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8L12 3.5z',
  parque: 'M5.5 11l1.3-4a2 2 0 0 1 1.9-1.4h6.6a2 2 0 0 1 1.9 1.4l1.3 4m-13 0h13m-13 0a2 2 0 0 0-2 2v3.5h2.2m12.8-5.5a2 2 0 0 1 2 2v3.5h-2.2m-10.6 0a1.6 1.6 0 1 1-3.2 0m13.8 0a1.6 1.6 0 1 1-3.2 0m-7.4 0h7.4',
  send: 'M4 12l16-7-5 16-3.5-6L4 12z',
}

export default function CatIcon({ cat, size = 16 }) {
  const d = PATHS[cat] || PATHS.bancada
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {d.split(' M').map((p, i) => <path key={i} d={(i ? 'M' : '') + p} />)}
    </svg>
  )
}
