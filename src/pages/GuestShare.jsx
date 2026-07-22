import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { seatLabel } from '../lib/parseTicket'
import { CATEGORIES, fmtDate } from '../lib/format'
import CatIcon from '../components/CatIcon'

// Página pública do convidado: abre com o link curto enviado por WhatsApp
export default function GuestShare() {
  const { token } = useParams()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .rpc('get_share', { tok: token })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else if (!data?.length) setError('vazio')
        else setRows(data)
      })
  }, [token])

  if (error) {
    return (
      <div className="center-screen login">
        <div className="login-card">
          <div className="login-badge">GP</div>
          <h1>Link inválido</h1>
          <p className="muted">Este link de bilhetes já não está ativo ou expirou.<br />Contacta quem to enviou.</p>
        </div>
      </div>
    )
  }
  if (!rows) return <div className="center-screen"><div className="spinner" /></div>

  const g = rows[0]
  return (
    <div className="center-screen login guest-page">
      <div className="login-card guest-card">
        <div className="login-badge">GP</div>
        <h1>{g.game_title}</h1>
        <p className="muted">
          {fmtDate(g.match_date)}{g.match_time ? ` · ${g.match_time}` : ''} · Estádio do Dragão
        </p>
        <p className="muted small">Olá{g.guest_name && !/convidado/i.test(g.guest_name) ? ` ${g.guest_name}` : ''}! {rows.length > 1 ? `Tens ${rows.length} bilhetes:` : 'Aqui está o teu bilhete:'}</p>
        <div className="guest-list">
          {rows.map((r, i) => (
            <a key={i} className="guest-ticket" href={r.url} target="_blank" rel="noreferrer">
              <span className="guest-cat"><CatIcon cat={r.category} size={18} /></span>
              <span className="guest-info">
                <b>{CATEGORIES[r.category]?.singular || 'Bilhete'}</b>
                <span className="muted small">{seatLabel(r)}</span>
              </span>
              <span className="guest-open">Abrir PDF</span>
            </a>
          ))}
        </div>
        <p className="muted small">Guarda o(s) PDF(s) no telemóvel ou apresenta o QR code à entrada.</p>
      </div>
    </div>
  )
}
