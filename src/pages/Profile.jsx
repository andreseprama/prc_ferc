import { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import { fetchProfiles, updateProfile } from '../lib/api'
import { SUPABASE_URL } from '../lib/config'

export default function Profile() {
  const { profile, isAdmin, signOut } = useAuth()
  const [name, setName] = useState('')
  const [people, setPeople] = useState([])
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (profile) setName(profile.name) }, [profile])
  useEffect(() => { if (isAdmin) fetchProfiles().then(setPeople).catch(() => {}) }, [isAdmin])

  async function save() {
    await updateProfile(profile.id, { name: name.trim() })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0]

  return (
    <div className="page">
      <header className="page-head"><h1>Perfil</h1></header>
      <div className="pad">
        <div className="card">
          <label>
            O teu nome
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn small" onClick={save}>{saved ? '✓ Guardado' : 'Guardar'}</button>
          <p className="muted small">{profile?.email} · {isAdmin ? 'Administrador' : 'Membro'}</p>
        </div>

        {isAdmin && (
          <div className="card">
            <h3>Pessoas</h3>
            {people.map((p) => (
              <div key={p.id} className="person-row">
                <span>{p.name} <span className="muted small">{p.email}</span></span>
                <span className="muted small">{p.role === 'admin' ? 'Admin' : 'Membro'}</span>
              </div>
            ))}
            <p className="muted small">
              Para adicionar alguém: painel do Supabase → Authentication → Users → <b>Add user</b>{' '}
              (<a href={`https://supabase.com/dashboard/project/${projectRef}/auth/users`} target="_blank" rel="noreferrer">abrir</a>).
              A pessoa aparece aqui depois do primeiro registo.
            </p>
          </div>
        )}

        <div className="card">
          <h3>Instalar no iPhone</h3>
          <p className="muted small">
            Abre esta página no <b>Safari</b> → botão <b>Partilhar</b> → <b>Adicionar ao ecrã principal</b>.
            A app fica com ícone próprio, como uma app normal.
          </p>
        </div>

        <button className="btn danger ghost" onClick={signOut}>Terminar sessão</button>
      </div>
    </div>
  )
}
