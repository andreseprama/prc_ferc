import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../AuthContext'
import { fetchProfiles, updateProfile, adminCreateUser, adminDeleteUser, changeRole, changeMyPassword } from '../lib/api'
import { COMPANIES } from '../lib/format'

function genPassword() {
  const words = ['Dragao', 'Porto', 'Invicta', 'Azul', 'Antas', 'Campeao']
  const w = words[Math.floor(Math.random() * words.length)]
  const n = Math.floor(1000 + Math.random() * 9000)
  return `${w}-${n}`
}

export default function Profile() {
  const { profile, isAdmin, signOut } = useAuth()
  const [name, setName] = useState('')
  const [people, setPeople] = useState([])
  const [saved, setSaved] = useState(false)
  const [adding, setAdding] = useState(false)
  const [nu, setNu] = useState({ name: '', email: '', password: genPassword(), role: 'member', company: 'procarro' })
  const [created, setCreated] = useState(null) // credenciais acabadas de criar
  const [busy, setBusy] = useState(false)
  const [pw, setPw] = useState('')
  const [pwSaved, setPwSaved] = useState(false)

  const loadPeople = useCallback(() => {
    if (isAdmin) fetchProfiles().then(setPeople).catch(() => {})
  }, [isAdmin])

  useEffect(() => { if (profile) setName(profile.name) }, [profile])
  useEffect(() => { loadPeople() }, [loadPeople])

  async function save() {
    await updateProfile(profile.id, { name: name.trim() })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function savePw() {
    if (pw.length < 8) { alert('A palavra-passe deve ter pelo menos 8 caracteres.'); return }
    try {
      await changeMyPassword(pw)
      setPw(''); setPwSaved(true)
      setTimeout(() => setPwSaved(false), 2500)
    } catch (e) { alert(e.message) }
  }

  async function createUser() {
    const { name: n, email, password, role, company } = nu
    if (!n.trim() || !/.+@.+\..+/.test(email)) { alert('Preenche o nome e um email válido.'); return }
    if (password.length < 8) { alert('A palavra-passe deve ter pelo menos 8 caracteres.'); return }
    setBusy(true)
    try {
      await adminCreateUser(email.trim().toLowerCase(), password, n.trim(), role, company)
      setCreated({ name: n.trim(), email: email.trim().toLowerCase(), password })
      setNu({ name: '', email: '', password: genPassword(), role: 'member', company: 'procarro' })
      setAdding(false)
      loadPeople()
    } catch (e) {
      alert(/duplicate|already|exists/i.test(e.message) ? 'Já existe uma conta com esse email.' : e.message)
    } finally { setBusy(false) }
  }

  async function removeUser(p) {
    if (!confirm(`Remover o acesso de ${p.name}? As reservas dele ficam sem dono (os registos mantêm-se).`)) return
    try { await adminDeleteUser(p.id, p.name); loadPeople() } catch (e) { alert(e.message) }
  }

  async function setRole(p, role) {
    try { await changeRole(p.id, role, p.name); loadPeople() } catch (e) { alert(e.message) }
  }

  async function setCompany(p, company) {
    try { await updateProfile(p.id, { company }); loadPeople() } catch (e) { alert(e.message) }
  }

  const credText = created
    ? `Acesso à app Bilhetes Procarro:\n${location.origin}${location.pathname}\nEmail: ${created.email}\nPalavra-passe: ${created.password}`
    : ''

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

        <div className="card">
          <h3>Alterar palavra-passe</h3>
          <label>
            Nova palavra-passe (mín. 8 caracteres)
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          </label>
          <button className="btn small" onClick={savePw} disabled={!pw}>{pwSaved ? '✓ Alterada' : 'Alterar'}</button>
        </div>

        {isAdmin && (
          <div className="card">
            <h3>Pessoas</h3>
            {people.map((p) => (
              <div key={p.id} className="person-row">
                <span className="person-name">
                  {p.name}
                  <span className="muted small">{p.email}</span>
                  <span className={`chip cmp-chip cmp-${p.company || 'procarro'}`}>{COMPANIES[p.company || 'procarro']?.label}</span>
                </span>
                {p.id === profile?.id ? (
                  <span className="muted small">Tu (Admin)</span>
                ) : (
                  <span className="person-actions">
                    <select value={p.company || 'procarro'} onChange={(e) => setCompany(p, e.target.value)}>
                      <option value="procarro">Procarro</option>
                      <option value="fercopor">Fercopor</option>
                    </select>
                    <select value={p.role} onChange={(e) => setRole(p, e.target.value)}>
                      <option value="member">Membro</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button className="x-btn" title="Remover" onClick={() => removeUser(p)}>✕</button>
                  </span>
                )}
              </div>
            ))}

            {created && (
              <div className="credbox">
                <b>Conta criada para {created.name}</b>
                <pre>{credText}</pre>
                <div className="row2">
                  <button className="btn small" onClick={() => { navigator.clipboard.writeText(credText); }}>Copiar</button>
                  <button className="btn small wa" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(credText)}`, '_blank')}>Enviar WhatsApp</button>
                </div>
                <button className="link-btn" onClick={() => setCreated(null)}>fechar</button>
              </div>
            )}

            {adding ? (
              <div className="adduser">
                <label>Nome<input value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} placeholder="ex.: Didier" /></label>
                <label>Email<input type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} placeholder="ex.: didier@procarro.pt" /></label>
                <label>
                  Palavra-passe inicial
                  <span className="pw-row">
                    <input value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
                    <button className="btn small ghost" onClick={() => setNu({ ...nu, password: genPassword() })}>↻</button>
                  </span>
                </label>
                <div className="row2">
                  <label>
                    Empresa
                    <select value={nu.company} onChange={(e) => setNu({ ...nu, company: e.target.value })}>
                      <option value="procarro">Procarro</option>
                      <option value="fercopor">Fercopor</option>
                    </select>
                  </label>
                  <label>
                    Perfil
                    <select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
                      <option value="member">Membro</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </label>
                </div>
                <div className="row2">
                  <button className="btn primary small" onClick={createUser} disabled={busy}>{busy ? 'A criar…' : 'Criar conta'}</button>
                  <button className="btn small ghost" onClick={() => setAdding(false)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button className="btn small" onClick={() => setAdding(true)}>+ Adicionar pessoa</button>
            )}
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
