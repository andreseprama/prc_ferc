// Testa o parser real (src/lib/parseTicket.js) contra PDFs de exemplo
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { parseTicket, seatLabel } from '../src/lib/parseTicket.js'

async function extractItems(buf) {
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise
  const page = await doc.getPage(1)
  const content = await page.getTextContent()
  return content.items
    .filter((i) => i.str && i.str.trim())
    .map((i) => ({ str: i.str.trim(), x: i.transform[4], y: i.transform[5], h: i.height }))
}

const root = process.argv[2]
const files = []
function walk(d) {
  for (const f of readdirSync(d)) {
    const fp = join(d, f)
    if (statSync(fp).isDirectory()) walk(fp)
    else if (f.toLowerCase().endsWith('.pdf')) files.push(fp)
  }
}
walk(root)

for (const f of files) {
  const rel = f.slice(root.length + 1)
  const t = parseTicket(await extractItems(readFileSync(f)), rel)
  console.log([
    rel.slice(0, 55).padEnd(57),
    (t.category || '??').padEnd(9),
    seatLabel(t).padEnd(30),
    `${t.date || '??'} ${t.time || '??'}`,
    (t.opponent || '??').padEnd(10),
    t.code || '??',
    t.warnings.length ? 'AVISOS: ' + t.warnings.join('; ') : '',
  ].join(' | '))
}
