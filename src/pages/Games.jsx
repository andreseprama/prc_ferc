import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchGames } from '../lib/api'
import { CATEGORIES, fmtDate } from '../lib/format'
import { useAuth } from '../AuthContext'

export default function Games() {
  const [games, setGames] = useState(null)
  const [error, setError] = useState(null)
  const { isAdmin } = useAuth()

  useEffect(() => {
    fetchGames().then(setGames).catch((e) => setError(e.message))
  }, [])

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
          for (const t of g.tickets) {
            byCat[t.category] = byCat[t.category] || { total: 0, assigned: 0 }
            byCat[t.category].total++
            if (t.assigned_to) byCat[t.category].assigned++
          }
          return (
            <Link key={g.id} to={`/jogo/${g.id}`} className="card game-card">
              <div className="game-title">
                <strong>{g.title}</strong>
                <span className="muted">{fmtDate(g.match_date)}{g.match_time ? ` · ${g.match_time}` : ''}</span>
              </div>
              <div className="chips">
                {Object.entries(CATEGORIES).map(([key, c]) =>
                  byCat[key] ? (
                    <span key={key} className={`chip cat-${key}`}>
                      {c.emoji} {byCat[key].assigned}/{byCat[key].total}
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
