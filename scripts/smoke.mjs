import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const p = await b.newPage()
const errors = []
p.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
p.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()) })
await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' }).catch(()=>{})
await p.waitForTimeout(2500)
console.log('TITLE:', await p.title())
console.log('BODY:', (await p.textContent('body'))?.slice(0, 300))
await p.screenshot({ path: '/tmp/login.png' })
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none')
await b.close()
