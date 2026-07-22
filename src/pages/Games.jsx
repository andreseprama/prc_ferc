import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { fetchGames } from '../lib/api'
import { CATEGORIES, fmtDate, isTaken } from '../lib/format'
import { useAuth } from '../AuthContext'
import CatIcon from '../components/CatIcon'

export default function Games() {
  const [games, setGames] = useState(null)
  const [error, setError] = useState(null)
  const { isAdmin } = useAuth()

  const load = useCallback(() => {
    fetchGames().then(setGames).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [load])

  if (error) return <p className="error pad">{error}</p>
  if (!games) return <div className="center-fill"><div className="spinner" /></div>

  return (
    <div className="page">
      <header className="page-head">
        <h1>Jogos</h1>
      </header>
      {games.length === 0 && (
        <div className="empty">
          <p>Ainda não há jogos.</p>
          {isAdmin && <p className="muted">Vai a <Link to="/importar">Importar</Link> e carrega o zip de bilhetes do FC Porto.</p>}
        </div>
      )}
      <div className="cards">
        {games.map((g) => {
          const byCat = {}
          let taken = 0
          for (const t of g.tickets) {
            byCat[t.category] = byCat[t.category] || { total: 0, assigned: 0 }
            byCat[t.category].total++
            if (isTaken(t)) { byCat[t.category].assigned++; taken++ }
          }
          const total = g.tickets.length
          return (
            <Link key={g.id} to={`/jogo/${g.id}`} className="card game-card">
              <div className="game-top">
                <div className="game-title">
                  <strong>{g.title}</strong>
                  <span className="muted small">
                    {fmtDate(g.match_date)}{g.match_time ? ` · ${g.match_time}` : ''}
                    {g.competition ? ` · ${g.competition}` : ''}
                  </span>
                </div>
                <span className="game-total muted small">{taken}/{total}</span>
              </div>
              <div className="progress"><span style={{ width: total ? `${(taken / total) * 100}%` : 0 }} /></div>
              <div className="chips">
                {Object.entries(CATEGORIES).map(([key, c]) =>
                  byCat[key] ? (
                    <span key={key} className={`chip cat-${key}`}>
                      <CatIcon cat={key} size={14} /> {c.label} {byCat[key].assigned}/{byCat[key].total}
                    </span>
                  ) : null
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
