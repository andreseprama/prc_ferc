// Testa o fluxo de partilha WhatsApp (mock): clicar Partilhar → wa.me abre → sheet "A quem enviaste?"
import { chromium } from 'playwright'
const SB = 'https://wdfixavttqfsawcluylb.supabase.co'
const USER = { id: 'u-admin', email: 'a@a.pt', aud: 'authenticated', role: 'authenticated' }
const SESSION = { access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, refresh_token: 'r', user: USER }
const PROFILE = { id: 'u-admin', email: 'a@a.pt', name: 'André', role: 'admin' }
const T = { id: 't3', game_id: 'g1', category: 'camarote', zone: 'Cam 5', row: '10', seat: '3', code: '231014', file_path: 'g1/t3.pdf', assigned_to: 'u-admin', assignee: { id: 'u-admin', name: 'André' }, shares: [] }
const GAME = { id: 'g1', title: 'FC Porto x OGC Nice', match_date: '2025-11-27', match_time: '17:45', tickets: [T] }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
const p = await ctx.newPage()
const errors = []
p.on('pageerror', e => errors.push(e.message))
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
let popupUrl = null
ctx.on('page', pg => { pg.on('framenavigated', f => { if (f.url().includes('wa.me')) popupUrl = f.url() }) })
await ctx.route('https://wa.me/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: 'wa' }))
await p.route(`${SB}/**`, (route) => {
  const url = route.request().url()
  const single = (route.request().headers()['accept'] || '').includes('pgrst.object')
  const method = route.request().method()
  if (url.includes('/auth/v1/token')) return route.fulfill(json(SESSION))
  if (url.includes('/auth/v1/user')) return route.fulfill(json(USER))
  if (url.includes('/rest/v1/profiles')) return route.fulfill(json(single ? PROFILE : [PROFILE]))
  if (url.includes('/rest/v1/games')) return route.fulfill(json(single || url.includes('id=eq.g1') ? GAME : [GAME]))
  if (url.includes('/rest/v1/shares')) {
    if (method === 'POST') return route.fulfill(json({ id: 's-new', ticket_id: 't3', guest_name: 'Convidado (WhatsApp)', url: 'https://sb/signed/x' }))
    return route.fulfill(json([]))
  }
  if (url.includes('/storage/v1/object/sign/')) return route.fulfill(json({ signedURL: '/signed/abc', signedUrl: '/signed/abc' }))
  if (url.includes('/rest/v1/')) return route.fulfill(method === 'POST' ? { status: 201, body: '' } : json([]))
  return route.fulfill(json({}))
})
await p.goto('http://localhost:4173/#/jogo/g1', { waitUntil: 'domcontentloaded' })
await p.fill('input[type=email]', 'a@a.pt'); await p.fill('input[type=password]', 'x')
await p.click('button:has-text("Entrar")'); await p.waitForTimeout(1200)
await p.click('.ticket >> nth=0'); await p.waitForTimeout(400)
await p.click('button:has-text("Partilhar por WhatsApp")'); await p.waitForTimeout(1500)
console.log('wa.me aberto →', popupUrl ? popupUrl.slice(0, 90) : 'NÃO')
console.log('sheet →', (await p.textContent('.sheet').catch(() => 'SEM SHEET'))?.slice(0, 140))
await p.fill('.sheet input >> nth=0', 'João Silva')
await p.click('button:has-text("Guardar")'); await p.waitForTimeout(600)
console.log('após guardar, sheet fechada?', !(await p.$('.sheet')))
console.log('ERROS:', errors.length ? errors.join(' | ') : 'nenhum')
await b.close()
