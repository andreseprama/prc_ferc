import { HashRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import { isConfigured } from './lib/supabase'
import Login from './pages/Login'
import Games from './pages/Games'
import GameDetail from './pages/GameDetail'
import ImportGame from './pages/ImportGame'
import Activity from './pages/Activity'
import Profile from './pages/Profile'
import GuestShare from './pages/GuestShare'

function Icon({ name }) {
  const paths = {
    games: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 1 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 1 0 0-4V7z',
    import: 'M12 3v10m0 0 4-4m-4 4-4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2',
    activity: 'M3 12h4l2-7 4 14 2-7h6',
    profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0',
  }
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  )
}

function Shell({ children }) {
  const { isAdmin } = useAuth()
  return (
    <div className="shell">
      <main className="content">{children}</main>
      <nav className="tabbar">
        <NavLink to="/" end><Icon name="games" /><span>Jogos</span></NavLink>
        {isAdmin && <NavLink to="/importar"><Icon name="import" /><span>Importar</span></NavLink>}
        <NavLink to="/atividade"><Icon name="activity" /><span>Registo</span></NavLink>
        <NavLink to="/perfil"><Icon name="profile" /><span>Perfil</span></NavLink>
      </nav>
    </div>
  )
}

function AuthedApp() {
  const { session } = useAuth()
  if (session === undefined) return <div className="center-screen"><div className="spinner" /></div>
  if (!session) return <Login />
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Games />} />
        <Route path="/jogo/:id" element={<GameDetail />} />
        <Route path="/importar" element={<ImportGame />} />
        <Route path="/atividade" element={<Activity />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  )
}

function Gate() {
  return (
    <Routes>
      {/* página pública do convidado — não exige login */}
      <Route path="/c/:token" element={<GuestShare />} />
      <Route path="/*" element={<AuthedApp />} />
    </Routes>
  )
}

export default function App() {
  if (!isConfigured) {
    return (
      <div className="center-screen">
        <p style={{ padding: 24, textAlign: 'center' }}>
          A app ainda não está ligada ao Supabase.<br />Falta configurar o URL e a chave.
        </p>
      </div>
    )
  }
  return (
    <AuthProvider>
      <HashRouter>
        <Gate />
      </HashRouter>
    </AuthProvider>
  )
}
