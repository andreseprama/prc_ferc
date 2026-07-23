// Simula um telemóvel: verifica que a partilha usa whatsapp:// e a página NÃO navega
import { chromium, devices } from 'playwright'
const SB = 'https://wdfixavttqfsawcluylb.supabase.co'
const USER = { id: 'u1', email: 'a@a.pt', aud: 'authenticated', role: 'authenticated' }
const SESSION = { access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, refresh_token: 'r', user: USER }
const P = { id: 'u1', email: 'a@a.pt', name: 'André', role: 'admin' }
const T = { id: 'b1', game_id: 'g1', category: 'bancada', zone: 'ARQ. POENTE', sector: '41', row: '8', seat: '1', code: 'c1', file_path: 'g1/b1.pdf', assigned_to: 'u1', assignee: { id: 'u1', name: 'André' }, shares: [] }
const GAME = { id: 'g1', title: 'FC Porto x OGC Nice', match_date: '2025-11-27', match_time: '17:45', tickets: [T] }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await b.newContext({ ...devices['iPhone 13'] })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', e => errors.push(e.message))
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
let schemeUrl = null
await p.route('whatsapp://**', r => { schemeUrl = r.request().url(); r.abort() }).catch(() => {})
await p.route(SB + '/**', (route) => {
  const url = route.request().url()
  const single = (route.request().headers()['accept'] || '').includes('pgrst.object')
  const method = route.request().method()
  if (url.includes('/auth/v1/token')) return route.fulfill(json(SESSION))
  if (url.includes('/rest/v1/profiles')) return route.fulfill(json(single ? P : [P]))
  if (url.includes('/rest/v1/games')) return route.fulfill(json(single || url.includes('id=eq.g1') ? GAME : [GAME]))
  if (url.includes('/rest/v1/shares') && method === 'POST') return route.fulfill(json({ id: 's1', token: 'x' }))
  if (url.includes('/storage/v1/object/sign/')) return route.fulfill(json({ signedURL: '/s/a', signedUrl: '/s/a' }))
  if (url.includes('/rest/v1/')) return route.fulfill(method === 'POST' ? { status: 201, body: '' } : json([]))
  return route.fulfill(json({}))
})
// intercepta a tentativa de navegação para whatsapp://
await p.addInitScript(() => {
  window.__nav = []
  const orig = Object.getOwnPropertyDescriptor(window.Location.prototype, 'href')
  Object.defineProperty(window.Location.prototype, 'href', {
    get: orig.get,
    set(v) { window.__nav.push(v); if (!v.startsWith('whatsapp:')) orig.set.call(this, v) },
  })
})
await p.goto('http://localhost:4173/#/jogo/g1', { waitUntil: 'domcontentloaded' })
await p.fill('input[type=email]', 'a@a.pt'); await p.fill('input[type=password]', 'x')
await p.click('button:has-text("Entrar")'); await p.waitForTimeout(1200)
await p.click('.tile >> nth=0'); await p.waitForTimeout(400)
await p.click('button:has-text("Partilhar por WhatsApp")')
await p.waitForTimeout(1200)
const navs = await p.evaluate(() => window.__nav)
console.log('navegações →', JSON.stringify(navs).slice(0, 140))
console.log('página continua na app?', (await p.url()).includes('#/jogo/g1'))
console.log('sheet A quem enviaste?', (await p.textContent('.sheet').catch(() => ''))?.includes('A quem enviaste'))
console.log('ERROS:', errors.length ? errors.join(' | ') : 'nenhum')
await b.close()
