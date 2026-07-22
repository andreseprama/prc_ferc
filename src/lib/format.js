export const CATEGORIES = {
  bancada: { label: 'Bancadas', singular: 'Bancada', emoji: '🎟️' },
  camarote: { label: 'Camarote', singular: 'Camarote', emoji: '⭐' },
  parque: { label: 'Parque', singular: 'Parque', emoji: '🅿️' },
}

export function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''))
  return d.toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtDateTime(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
}

export const ACTION_LABELS = {
  jogo_importado: 'importou o jogo',
  jogo_apagado: 'apagou o jogo',
  bilhetes_atribuidos: 'atribuiu bilhetes',
  atribuicao_removida: 'removeu uma atribuição',
  bilhete_partilhado: 'partilhou um bilhete',
  partilha_anulada: 'anulou uma partilha',
  bilhete_aberto: 'abriu um bilhete',
}
