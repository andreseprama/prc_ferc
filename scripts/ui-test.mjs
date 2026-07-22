// Teste de UI com Supabase simulado (network mock)
import { chromium } from 'playwright'

const SB = 'https://wdfixavttqfsawcluylb.supabase.co'
const USER = { id: 'u-admin', email: 'andrecouto10@gmail.com', aud: 'authenticated', role: 'authenticated' }
const SESSION = {
  access_token: 'fake.jwt.token', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'fake-refresh', user: USER,
}
const PROFILES = [
  { id: 'u-admin', email: 'andrecouto10@gmail.com', name: 'André Couto', role: 'admin', created_at: '2026-07-01' },
  { id: 'u-2', email: 'didier@procarro.pt', name: 'Didier', role: 'member', created_at: '2026-07-01' },
]
const TICKETS = [
  { id: 't1', game_id: 'g1', category: 'bancada', zone: 'ARQ. POENTE', sector: '41', row: '8', seat: '1', gate: '5-6-24-25', entrance: '36', floor: null, code: '864347', file_path: 'g1/t1.pdf', assigned_to: 'u-2', guest_note: null, assignee: { id: 'u-2', name: 'Didier' }, shares: [] },
  { id: 't2', game_id: 'g1', category: 'bancada', zone: 'ARQ. POENTE', sector: '41', row: '8', seat: '2', gate: '5-6-24-25', entrance: '36', floor: null, code: '320903', file_path: 'g1/t2.pdf', assigned_to: null, guest_note: null, assignee: null, shares: [] },
  { id: 't3', game_id: 'g1', category: 'camarote', zone: 'Cam 5', sector: null, row: '10', seat: '3', gate: '1', entrance: null, floor: null, code: '231014', file_path: 'g1/t3.pdf', assigned_to: 'u-admin', guest_note: null, assignee: { id: 'u-admin', name: 'André Couto' }, shares: [{ id: 's1', guest_name: 'João Silva', guest_contact: '912345678', url: 'https://x/pdf', revoked: false, created_at: '2026-07-20', shared_by: 'u-admin' }] },
  { id: 't4', game_id: 'g1', category: 'parque', zone: 'Parque', sector: null, row: null, seat: null, gate: null, entrance: 'P3', floor: '-2 / -1', code: '033378', file_path: 'g1/t4.pdf', assigned_to: null, guest_note: null, assignee: null, shares: [] },
]
const GAME = { id: 'g1', title: 'FC Porto x OGC Nice', opponent: 'OGC Nice', competition: 'Liga Europa', match_date: '2025-11-27', match_time: '17:45', created_at: '2026-07-01', tickets: TICKETS }
const ACTIVITY = [
  { id: 1, actor: 'u-admin', action: 'jogo_importado', game_id: 'g1', ticket_id: null, details: { title: 'FC Porto x OGC Nice', total: 41 }, created_at: '2026-07-20T10:00:00Z', profile: { name: 'André Couto' } },
  { id: 2, actor: 'u-admin', action: 'bilhetes_atribuidos', game_id: 'g1', ticket_id: null, details: { bilhetes: 4 }, created_at: '2026-07-20T10:05:00Z', profile: { name: 'André Couto' } },
]

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
p.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
p.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)) })

function json(body) { return { status: 200, contentType: 'application/json', body: JSON.stringify(body) } }

await p.route(`${SB}/**`, (route) => {
  const url = route.request().url()
  const single = (route.request().headers()['accept'] || '').includes('pgrst.object')
  if (url.includes('/auth/v1/token')) return route.fulfill(json(SESSION))
  if (url.includes('/auth/v1/user')) return route.fulfill(json(USER))
  if (url.includes('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' })
  if (url.includes('/rest/v1/profiles')) {
    if (single) return route.fulfill(json(PROFILES[0]))
    return route.fulfill(json(PROFILES))
  }
  if (url.includes('/rest/v1/games')) {
    if (single || url.includes('id=eq.g1')) return route.fulfill(json(GAME))
    return route.fulfill(json([GAME]))
  }
  if (url.includes('/rest/v1/activity')) {
    if (route.request().method() === 'POST') return route.fulfill({ status: 201, body: '' })
    return route.fulfill(json(ACTIVITY))
  }
  if (url.includes('/rest/v1/')) return route.fulfill(json([]))
  return route.fulfill(json({}))
})

const shots = []
async function shot(name) { const f = `/tmp/ui-${name}.png`; await p.screenshot({ path: f }); shots.push(f) }

await p.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' })
await p.fill('input[type=email]', 'andrecouto10@gmail.com')
await p.fill('input[type=password]', 'xxxx')
await p.click('button:has-text("Entrar")')
await p.waitForTimeout(1500)
console.log('após login →', (await p.textContent('body'))?.slice(0, 120))
await shot('jogos')

await p.click('text=FC Porto x OGC Nice')
await p.waitForTimeout(1200)
console.log('detalhe →', (await p.textContent('.tabs'))?.trim())
await shot('jogo')

// abrir um bilhete (sheet)
await p.click('.tile >> nth=0')
await p.waitForTimeout(500)
console.log('sheet →', (await p.textContent('.sheet'))?.slice(0, 160))
await shot('sheet')
await p.click('.sheet-backdrop', { position: { x: 10, y: 10 } })

// separador camarote
await p.click('.tabs button:has-text("Camarote")')
await p.waitForTimeout(400)
console.log('camarote →', (await p.textContent('.tickets'))?.slice(0, 160))

// modo selecionar
await p.click('button:has-text("Selecionar")')
await p.click('.tile >> nth=0')
await p.waitForTimeout(300)
console.log('floatbar →', (await p.textContent('.floatbar').catch(() => 'FALHOU')))
await shot('selecao')
await p.click('.floatbar button:has-text("Reservar")')
await p.waitForTimeout(400)
console.log('assign sheet →', (await p.textContent('.sheet'))?.slice(0, 120))
await p.click('.sheet-backdrop', { position: { x: 10, y: 10 } })

// registo
await p.click('.tabbar a:has-text("Registo")')
await p.waitForTimeout(800)
console.log('registo →', (await p.textContent('.activity'))?.slice(0, 160))
await shot('registo')

// importar
await p.click('.tabbar a:has-text("Importar")')
await p.waitForTimeout(500)
console.log('importar →', (await p.textContent('.page'))?.slice(0, 140))

// perfil
await p.click('.tabbar a:has-text("Perfil")')
await p.waitForTimeout(700)
console.log('perfil →', (await p.textContent('.page'))?.slice(0, 140))
await shot('perfil')

console.log('\nERROS:', errors.length ? errors.join('\n') : 'nenhum')
console.log('SHOTS:', shots.join(' '))
await b.close()
