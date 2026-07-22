// Lê um zip de bilhetes do FC Porto no browser: extrai os PDFs e interpreta cada um.
import JSZip from 'jszip'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { parseTicket } from './parseTicket'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

async function extractItems(arrayBuffer) {
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  try {
    const page = await doc.getPage(1)
    const content = await page.getTextContent()
    return content.items
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({ str: i.str.trim(), x: i.transform[4], y: i.transform[5], h: i.height }))
  } finally {
    doc.destroy?.()
  }
}

// onProgress(done, total, name)
export async function readTicketZip(file, onProgress) {
  const zip = await JSZip.loadAsync(file)
  const entries = Object.values(zip.files).filter(
    (f) => !f.dir && f.name.toLowerCase().endsWith('.pdf') && !f.name.startsWith('__MACOSX')
  )
  if (!entries.length) throw new Error('O zip não contém PDFs.')

  const tickets = []
  let done = 0
  for (const entry of entries) {
    const buf = await entry.async('arraybuffer')
    let parsed
    try {
      const items = await extractItems(buf.slice(0))
      parsed = parseTicket(items, entry.name)
    } catch (e) {
      parsed = { category: null, warnings: [`Falha ao ler o PDF: ${e.message}`] }
    }
    tickets.push({
      originalName: entry.name,
      bytes: new Uint8Array(buf),
      parsed,
    })
    done++
    onProgress?.(done, entries.length, entry.name)
  }

  // deduzir o jogo a partir do próprio zip
  const first = tickets.find((t) => t.parsed?.opponent) || tickets[0]
  const dates = tickets.map((t) => t.parsed?.date).filter(Boolean)
  const times = tickets.map((t) => t.parsed?.time).filter(Boolean)
  // nome da pasta raiz tipo "FC Porto - OGC Nice"
  const rootDir = entries[0].name.includes('/') ? entries[0].name.split('/')[0] : null
  const opponent = first?.parsed?.opponent || (rootDir ? rootDir.replace(/FC Porto\s*[-x]\s*/i, '') : null)

  return {
    game: {
      opponent: opponent || '',
      title: opponent ? `FC Porto x ${opponent}` : rootDir || file.name.replace(/\.zip$/i, ''),
      date: dates[0] || '',
      time: times.sort()[0] || '',
    },
    tickets,
  }
}
