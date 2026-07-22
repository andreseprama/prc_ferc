import { chromium } from 'playwright'
const SB = 'https://wdfixavttqfsawcluylb.supabase.co'
const USER = { id: 'u1', email: 'a@a.pt', aud: 'authenticated', role: 'authenticated' }
const SESSION = { access_token: 't', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, refresh_token: 'r', user: USER }
const P = { id: 'u1', email: 'a@a.pt', name: 'André Couto', role: 'admin' }
const mk = (i, row, assigned) => ({ id: 'b'+i, game_id: 'g1', category: 'bancada', zone: 'ARQ. POENTE', sector: '41', row: String(row), seat: String(i), code: 'c'+i, file_path: 'g1/b'+i+'.pdf', assigned_to: assigned ? 'u1' : null, assignee: assigned ? { id: 'u1', name: 'André Couto' } : null, shares: [] })
const tickets = [...Array.from({length:9},(_,i)=>mk(i+1,8,i<3)), ...Array.from({length:9},(_,i)=>mk(i+10,9,false))]
const GAME = { id: 'g1', title: 'FC Porto x OGC Nice', match_date: '2025-11-27', match_time: '17:45', tickets }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 390, height: 844 } })
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
await p.route(SB + '/**', (route) => {
  const url = route.request().url()
  const single = (route.request().headers()['accept'] || '').includes('pgrst.object')
  if (url.includes('/auth/v1/token')) return route.fulfill(json(SESSION))
  if (url.includes('/rest/v1/profiles')) return route.fulfill(json(single ? P : [P]))
  if (url.includes('/rest/v1/games')) return route.fulfill(json(single || url.includes('id=eq.g1') ? GAME : [GAME]))
  if (url.includes('/rest/v1/')) return route.fulfill(json([]))
  return route.fulfill(json({}))
})
await p.goto('http://localhost:4173/#/jogo/g1', { waitUntil: 'domcontentloaded' })
await p.fill('input[type=email]', 'a@a.pt'); await p.fill('input[type=password]', 'x')
await p.click('button:has-text("Entrar")'); await p.waitForTimeout(1400)
await p.screenshot({ path: '/tmp/filas.png' })
await b.close()
console.log('shot ok')
