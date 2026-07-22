import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { importGame } from '../lib/api'
import { seatLabel } from '../lib/parseTicket'
import { CATEGORIES } from '../lib/format'
import { useAuth } from '../AuthContext'

export default function ImportGame() {
  const { isAdmin } = useAuth()
  const nav = useNavigate()
  const [stage, setStage] = useState('pick') // pick | reading | preview | uploading
  const [progress, setProgress] = useState([0, 0])
  const [result, setResult] = useState(null)
  const [game, setGame] = useState(null)
  const [error, setError] = useState(null)

  if (!isAdmin) return <p className="pad muted">Apenas o administrador pode importar bilhetes.</p>

  async function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setStage('reading')
    try {
      const { readTicketZip } = await import('../lib/extractZip')
      const r = await readTicketZip(file, (d, t) => setProgress([d, t]))
      setResult(r)
      setGame(r.game)
      setStage('preview')
    } catch (err) {
      setError(err.message)
      setStage('pick')
    }
  }

  async function confirm() {
    setStage('uploading')
    setProgress([0, result.tickets.length])
    try {
      const { game: g, failed } = await importGame(game, result.tickets, (d, t) => setProgress([d, t]))
      if (failed.length) {
        alert(`Importado, mas ${failed.length} bilhete(s) falharam:\n` + failed.map((f) => `• ${f.name}: ${f.error}`).join('\n'))
      }
      nav(`/jogo/${g.id}`)
    } catch (e) {
      setError(e.message)
      setStage('preview')
    }
  }

  const counts = result
    ? result.tickets.reduce((acc, t) => {
        const c = t.parsed.category || '?'
        acc[c] = (acc[c] || 0) + 1
        return acc
      }, {})
    : {}
  const warnings = result ? result.tickets.filter((t) => t.parsed.warnings?.length) : []

  return (
    <div className="page">
      <header className="page-head"><h1>Importar jogo</h1></header>

      {stage === 'pick' && (
        <div className="pad">
          <p className="muted">Carrega o ficheiro <b>zip</b> tal como o FC Porto o envia (com as pastas Bancadas / Camarote / Parque). A app lê cada PDF e identifica o jogo, o setor, a fila e o lugar automaticamente.</p>
          {error && <p className="error">{error}</p>}
          <label className="dropzone">
            <input type="file" accept=".zip,application/zip,application/x-zip-compressed" onChange={onFile} hidden />
            <span>📦 Escolher zip de bilhetes</span>
          </label>
        </div>
      )}

      {(stage === 'reading' || stage === 'uploading') && (
        <div className="pad center">
          <div className="spinner" />
          <p className="muted">{stage === 'reading' ? 'A ler os PDFs…' : 'A carregar para o servidor…'} {progress[0]}/{progress[1]}</p>
          <progress value={progress[0]} max={progress[1] || 1} style={{ width: '100%' }} />
        </div>
      )}

      {stage === 'preview' && result && (
        <div className="pad">
          <div className="card">
            <label>
              Jogo
              <input value={game.title} onChange={(e) => setGame({ ...game, title: e.target.value })} />
            </label>
            <div className="row2">
              <label>
                Data
                <input type="date" value={game.date} onChange={(e) => setGame({ ...game, date: e.target.value })} />
              </label>
              <label>
                Hora
                <input type="time" value={game.time} onChange={(e) => setGame({ ...game, time: e.target.value })} />
              </label>
            </div>
            <label>
              Competição (opcional)
              <input value={game.competition || ''} onChange={(e) => setGame({ ...game, competition: e.target.value })} placeholder="ex.: Liga Europa" />
            </label>
          </div>

          <p><b>{result.tickets.length} bilhetes encontrados</b></p>
          <div className="chips">
            {Object.entries(counts).map(([c, n]) => (
              <span key={c} className={`chip cat-${c}`}>{CATEGORIES[c]?.emoji || '❓'} {CATEGORIES[c]?.label || c} · {n}</span>
            ))}
          </div>

          {warnings.length > 0 && (
            <div className="warnbox">
              <b>⚠️ {warnings.length} bilhete(s) com avisos</b>
              <ul>
                {warnings.slice(0, 8).map((t, i) => (
                  <li key={i}>{t.originalName.split('/').pop()}: {t.parsed.warnings.join('; ')}</li>
                ))}
              </ul>
            </div>
          )}

          <details className="preview-list">
            <summary>Ver lista completa</summary>
            <ul>
              {result.tickets.map((t, i) => (
                <li key={i}>
                  <span className={`dot cat-${t.parsed.category}`} /> {seatLabel(t.parsed)}
                  {t.parsed.code ? <span className="muted small"> · {t.parsed.code}</span> : null}
                </li>
              ))}
            </ul>
          </details>

          {error && <p className="error">{error}</p>}
          <div className="sheet-actions">
            <button className="btn primary" onClick={confirm}>Confirmar e importar</button>
            <button className="btn ghost" onClick={() => { setResult(null); setStage('pick') }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
