import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { APP_NAME } from '../lib/config'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      setError(
        /invalid/i.test(error.message)
          ? 'Email ou palavra-passe incorretos.'
          : `Erro ao entrar: ${error.message}`
      )
    }
    setBusy(false)
  }

  return (
    <div className="center-screen login">
      <div className="login-card">
        <div className="login-badge">🎟️</div>
        <h1>{APP_NAME}</h1>
        <p className="muted">Gestão dos bilhetes do Estádio do Dragão</p>
        <form onSubmit={submit}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </label>
          <label>
            Palavra-passe
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn primary" disabled={busy}>{busy ? 'A entrar…' : 'Entrar'}</button>
        </form>
        <p className="muted small">O acesso é criado pelo administrador.</p>
      </div>
    </div>
  )
}
