import { useEffect, useState } from 'react'
import { fetchActivity } from '../lib/api'
import { ACTION_LABELS, fmtDateTime } from '../lib/format'

export default function Activity() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchActivity().then(setRows).catch((e) => setError(e.message))
  }, [])

  if (error) return <p className="error pad">{error}</p>
  if (!rows) return <div className="center-fill"><div className="spinner" /></div>

  return (
    <div className="page">
      <header className="page-head"><h1>Registo</h1></header>
      {rows.length === 0 && <p className="pad muted">Ainda não há atividade registada.</p>}
      <div className="activity">
        {rows.map((r) => {
          const d = r.details || {}
          const extra = [
            d.title, d.convidado && `convidado: ${d.convidado}`, d.lugar,
            d.bilhetes && `${d.bilhetes} bilhete(s)`, d.para_nome && `a ${d.para_nome}`,
            d.nota && `nota: ${d.nota}`,
          ].filter(Boolean).join(' · ')
          return (
            <div key={r.id} className="activity-row">
              <div>
                <b>{r.profile?.name || 'Alguém'}</b> {ACTION_LABELS[r.action] || r.action}
                {extra && <span className="muted"> — {extra}</span>}
              </div>
              <span className="muted small">{fmtDateTime(r.created_at)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
