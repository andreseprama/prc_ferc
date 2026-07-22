// Testa: partilha em bloco gera 1 link curto; página do convidado renderiza
import { chromium } from 'playwright'
const SB = 'https://wdfixavttqfsawcluylb.supabase.co'
const USER = { id: 'u1', email: 'a@a.pt', aud: 'authenticated', role: 'authenticated' }
const SESSION = { access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, refresh_token: 'r', user: USER }
const P = { id: 'u1', email: 'a@a.pt', name: 'André', role: 'admin' }
const mk = (i) => ({ id: 'b'+i, game_id: 'g1', category: 'bancada', zone: 'ARQ. POENTE', sector: '41', row: '8', seat: String(i), code: 'c'+i, file_path: 'g1/b'+i+'.pdf', assigned_to: 'u1', assignee: { id: 'u1', name: 'André' }, shares: [] })
const GAME = { id: 'g1', title: 'FC Porto x OGC Nice', match_date: '2025-11-27', match_time: '17:45', tickets: [mk(1), mk(2), mk(3)] }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', e => errors.push(e.message))
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
let waUrl = null, sharePosts = []
ctx.on('page', pg => { pg.on('framenavigated', f => { if (f.url().includes('wa.me')) waUrl = f.url() }) })
await ctx.route('https://wa.me/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: 'wa' }))
const handler = (route) => {
  const url = route.request().url()
  const single = (route.request().headers()['accept'] || '').includes('pgrst.object')
  const method = route.request().method()
  if (url.includes('/auth/v1/token')) return route.fulfill(json(SESSION))
  if (url.includes('/rest/v1/rpc/get_share')) {
    const body = JSON.parse(route.request().postData() || '{}')
    return route.fulfill(json([
      { guest_name: 'Trabalho', url: 'https://sb/x1', game_title: 'FC Porto x OGC Nice', match_date: '2025-11-27', match_time: '17:45', category: 'bancada', zone: 'ARQ. POENTE', sector: '41', row: '8', seat: '1' },
      { guest_name: 'Trabalho', url: 'https://sb/x2', game_title: 'FC Porto x OGC Nice', match_date: '2025-11-27', match_time: '17:45', category: 'bancada', zone: 'ARQ. POENTE', sector: '41', row: '8', seat: '2' },
    ]))
  }
  if (url.includes('/rest/v1/profiles')) return route.fulfill(json(single ? P : [P]))
  if (url.includes('/rest/v1/games')) return route.fulfill(json(single || url.includes('id=eq.g1') ? GAME : [GAME]))
  if (url.includes('/rest/v1/shares')) {
    if (method === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}')
      sharePosts.push(body)
      return route.fulfill(json({ id: 's'+sharePosts.length, ...body }))
    }
    return route.fulfill(json([]))
  }
  if (url.includes('/storage/v1/object/sign/')) return route.fulfill(json({ signedURL: '/signed/abc', signedUrl: '/signed/abc' }))
  if (url.includes('/rest/v1/')) return route.fulfill(method === 'POST' ? { status: 201, body: '' } : json([]))
  return route.fulfill(json({}))
}
await p.route(SB + '/**', handler)
await p.goto('http://localhost:4173/#/jogo/g1', { waitUntil: 'domcontentloaded' })
await p.fill('input[type=email]', 'a@a.pt'); await p.fill('input[type=password]', 'x')
await p.click('button:has-text("Entrar")'); await p.waitForTimeout(1200)
// selecionar 3 e partilhar
await p.click('button:has-text("Selecionar")')
await p.click('button:has-text("Selecionar todos")')
await p.click('button:has-text("Partilhar WhatsApp")')
await p.waitForTimeout(1500)
const decoded = waUrl ? decodeURIComponent(waUrl) : ''
console.log('mensagem →', decoded.replace(/^https:\/\/wa\.me\/\?text=/, '').slice(0, 160))
console.log('nº de links na mensagem:', (decoded.match(/#\/c\//g) || []).length)
console.log('tokens iguais nos 3 registos:', new Set(sharePosts.map(s => s.token)).size === 1, '| token len:', sharePosts[0]?.token?.length)
// página do convidado
const g = await ctx.newPage()
await g.route(SB + '/**', handler)
await g.goto('http://localhost:4173/#/c/' + sharePosts[0].token, { waitUntil: 'domcontentloaded' })
await g.waitForTimeout(900)
console.log('página convidado →', (await g.textContent('body'))?.replace(/\s+/g, ' ').slice(0, 200))
await g.screenshot({ path: '/tmp/guest.png' })
console.log('ERROS:', errors.length ? errors.join(' | ') : 'nenhum')
await b.close()
