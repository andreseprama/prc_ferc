// Interpretação dos bilhetes do FC Porto a partir do texto extraído do PDF (página 1).
// Funciona com itens de texto posicionados: [{ str, x, y, h }].
// Não depende do nome do ficheiro (que pode ter sido renomeado), mas usa a pasta como pista de categoria.

const MONTHS = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  janeiro: '01', fevereiro: '02', 'março': '03', marco: '03', abril: '04', maio: '05', junho: '06',
  julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
}

function normDate(s) {
  if (!s) return null
  let m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}` // ISO
  m = s.match(/^(\d{1,2})\s*-\s*([A-Za-zÀ-ú]+)\s*-\s*(\d{4})$/)
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()]
    if (mo) return `${m[3]}-${mo}-${String(m[1]).padStart(2, '0')}`
  }
  return null
}

function normTime(s) {
  if (!s) return null
  const m = s.match(/^(\d{1,2})[:hH](\d{2})$/)
  return m ? `${String(m[1]).padStart(2, '0')}:${m[2]}` : null
}

// Valor mais próximo ACIMA de um rótulo textual (usado nos bilhetes de parque: ENTRANCE, FLOOR)
function valueAboveLabel(items, labelRe) {
  const label = items.find((i) => labelRe.test(i.str))
  if (!label) return null
  let best = null
  for (const it of items) {
    if (it === label) continue
    const dy = it.y - label.y
    if (dy > 0 && dy < 40 && Math.abs(it.x - label.x) < 60) {
      if (!best || dy < best.dy) best = { it, dy }
    }
  }
  return best ? best.it.str : null
}

export function parseTicket(items, relPath = '') {
  items = items
    .filter((i) => i.str && i.str.trim())
    .map((i) => ({ str: i.str.trim(), x: i.x, y: i.y, h: i.h }))
  const all = items.map((i) => i.str)
  const t = {
    category: null, zone: null, sector: null, row: null, seat: null,
    gate: null, entrance: null, floor: null, code: null,
    date: null, time: null, opponent: null, home: 'FC Porto', holder: null,
    warnings: [],
  }

  // ---- categoria: pasta primeiro, conteúdo depois
  const p = relPath.toLowerCase()
  if (/camarote/.test(p)) t.category = 'camarote'
  else if (/parque|park/.test(p)) t.category = 'parque'
  else if (/bancada/.test(p)) t.category = 'bancada'

  const isParque = all.some((s) => /^PARQUE$/i.test(s)) || all.some((s) => /^FC Porto\s*x\s*/i.test(s))
  if (!t.category) {
    if (isParque) t.category = 'parque'
  }

  // ---- código do bilhete (dígitos longos)
  const codes = all.filter((s) => /^\d{10,}$/.test(s))
  t.code = codes[0] || null

  // ---- data e hora
  t.date = normDate(all.find((s) => /^\d{2}-\d{2}-\d{4}$/.test(s)) || all.find((s) => /^\d{1,2}\s*-\s*[A-Za-zÀ-ú]+\s*-\s*\d{4}$/.test(s)))
  t.time = normTime(all.find((s) => /^\d{1,2}:\d{2}$/.test(s)) || all.find((s) => /^\d{1,2}[hH]\d{2}$/.test(s)))

  // ---- jogo (equipas)
  const vsItem = all.find((s) => /^FC Porto\s*x\s*.+/i.test(s))
  if (vsItem) {
    t.opponent = vsItem.replace(/^FC Porto\s*x\s*/i, '').trim()
  } else {
    // dois itens grandes (h~25) no topo: "FC Porto" e o adversário
    const big = items.filter((i) => i.h >= 20 && i.h <= 30 && i.x < 200 && i.y > 500)
    const fc = big.find((i) => /^FC Porto$/i.test(i.str))
    const other = big.find((i) => !/^FC Porto$/i.test(i.str) && !/^\d/.test(i.str) && i.str.length > 1)
    if (fc && other) t.opponent = other.str
  }

  // ---- titular (ex.: "Grupo Procarro" / "8500065 - Grupo Procarro")
  const holder = items.find((i) => Math.abs(i.y - 465) < 12 && i.x < 60 && i.str.length > 3)
  if (holder) t.holder = holder.str.replace(/^\d+\s*-\s*/, '')

  if (t.category === 'parque' || isParque) {
    t.category = 'parque'
    t.entrance = valueAboveLabel(items, /^ENTRANCE$/i)
    t.floor = valueAboveLabel(items, /^FLOOR$/i)
    t.zone = 'Parque'
    return t
  }

  // ---- bancada / camarote: valores grandes (h>=20) na coluna esquerda, entre y 250 e 430
  // Ordem na página (de cima para baixo = y decrescente):
  //   bancada  (5 valores): PORTA, ENTRADA, SETOR, FILA, LUGAR
  //   camarote (3 valores): PORTA, FILA, LUGAR
  const bigVals = items
    .filter((i) => i.h >= 20 && i.h <= 30 && i.x < 250 && i.y > 250 && i.y < 435)
    .sort((a, b) => b.y - a.y)
    .map((i) => i.str)

  // zona (faixa preta, ex.: "ARQ. POENTE") — texto h~16 por volta de y 440-455
  const zone = items.find((i) => i.h >= 13 && i.h <= 19 && i.y > 432 && i.y < 462 && /[A-Za-z]/.test(i.str) && !/Abertura|Válido|Portas/i.test(i.str))
  if (zone) t.zone = zone.str

  if (bigVals.length === 5) {
    ;[t.gate, t.entrance, t.sector, t.row, t.seat] = bigVals
    if (!t.category) t.category = 'bancada'
  } else if (bigVals.length === 3) {
    ;[t.gate, t.row, t.seat] = bigVals
    if (!t.category) t.category = 'camarote'
  } else if (bigVals.length === 4) {
    ;[t.gate, t.sector, t.row, t.seat] = bigVals
    t.warnings.push('Formato pouco habitual (4 campos) — confirmar setor/fila/lugar.')
    if (!t.category) t.category = 'bancada'
  } else {
    t.warnings.push(`Não foi possível ler lugar/fila/setor automaticamente (${bigVals.length} campos).`)
    if (!t.category) t.category = 'bancada'
  }

  if (t.category === 'camarote' && !t.zone) {
    // tenta obter o nome do camarote a partir do nome original do ficheiro (se mantido)
    const m = relPath.match(/Camarotes?[^_]*_(Cam[^_]*)_/i)
    t.zone = m ? m[1] : 'Camarote'
  }
  return t
}

// Nome legível do lugar
export function seatLabel(t) {
  if (t.category === 'parque') {
    const bits = []
    if (t.entrance) bits.push(`Entrada ${t.entrance}`)
    if (t.floor) bits.push(`Piso ${t.floor}`)
    return bits.join(' · ') || 'Lugar de estacionamento'
  }
  const bits = []
  if (t.category === 'camarote') {
    if (t.zone && t.zone !== 'Camarote') bits.push(t.zone)
  } else if (t.sector) bits.push(`Setor ${t.sector}`)
  if (t.row) bits.push(`Fila ${t.row}`)
  if (t.seat) bits.push(`Lugar ${t.seat}`)
  return bits.join(' · ') || t.zone || '—'
}
