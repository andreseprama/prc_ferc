import { useEffect, useMemo, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { fetchGame, fetchProfiles, assignTickets, getTicketUrl, shareTicket, revokeShare, deleteGame, logActivity } from '../lib/api'
import { seatLabel } from '../lib/parseTicket'
import { CATEGORIES, fmtDate } from '../lib/format'
import { useAuth } from '../AuthContext'

function TicketRow({ t, me, isAdmin, selected, selecting, selectable, onToggle, onOpen }) {
  const mine = t.assigned_to === me
  const share = t.shares?.find((s) => !s.revoked)
  return (
    <button
      className={`ticket ${selected ? 'selected' : ''} ${selecting && !selectable ? 'dim' : ''}`}
      onClick={() => (selecting ? (selectable && onToggle(t.id)) : onOpen(t))}
    >
      {selecting && <span className={`checkbox ${selected ? 'on' : ''} ${!selectable ? 'off' : ''}`} />}
      <div className="ticket-main">
        <strong>{seatLabel(t)}</strong>
        <span className="muted small">
          {t.assigned_to
            ? <>Reservado para <b className={mine ? 'mine' : ''}>{t.assignee?.name || '—'}</b>{t.guest_note ? ` (${t.guest_note})` : ''}</>
            : 'Por atribuir'}
          {share && <> · 📤 {share.guest_name}</>}
        </span>
      </div>
      {(mine || isAdmin) && t.assigned_to && <span className="pdf-ind">PDF</span>}
    </button>
  )
}

export default function GameDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { profile, isAdmin } = useAuth()
  const [game, setGame] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [tab, setTab] = useState('bancada')
  const [error, setError] = useState(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [sheet, setSheet] = useState(null) // {type:'ticket'|'assign'|'share'|'bulkshare', ...}
  const [busy, setBusy] = useState(false)
  const [busyMsg, setBusyMsg] = useState('')

  const load = useCallback(() => {
    fetchGame(id).then(setGame).catch((e) => setError(e.message))
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { fetchProfiles().then(setProfiles).catch(() => {}) }, [])

  const sortT = (a, b) =>
    String(a.sector).localeCompare(String(b.sector), undefined, { numeric: true }) ||
    String(a.row).localeCompare(String(b.row), undefined, { numeric: true }) ||
    String(a.seat).localeCompare(String(b.seat), undefined, { numeric: true }) ||
    String(a.code).localeCompare(String(b.code))

  const groups = useMemo(() => {
    if (!game) return { unassigned: [], assigned: [] }
    const list = game.tickets.filter((t) => t.category === tab)
    return {
      unassigned: list.filter((t) => !t.assigned_to).sort(sortT),
      assigned: list.filter((t) => t.assigned_to).sort(sortT),
    }
  }, [game, tab])

  const cats = useMemo(() => {
    if (!game) return []
    const present = [...new Set(game.tickets.map((t) => t.category))]
    return ['bancada', 'camarote', 'parque'].filter((c) => present.includes(c))
  }, [game])

  useEffect(() => {
    if (cats.length && !cats.includes(tab)) setTab(cats[0])
  }, [cats, tab])

  if (error) return <p className="error pad">{error}</p>
  if (!game) return <div className="center-fill"><div className="spinner" /></div>

  const canSelect = (t) => isAdmin || t.assigned_to === profile?.id
  const allTickets = [...groups.unassigned, ...groups.assigned]
  const selectedTickets = allTickets.filter((t) => selected.has(t.id))
  // partilhar em bloco: todos os selecionados têm de ser meus (ou ser admin) e ter PDF
  const canBulkShare = selectedTickets.length > 0 && selectedTickets.every((t) => isAdmin || t.assigned_to === profile?.id)

  const toggle = (tid) => {
    const s = new Set(selected)
    s.has(tid) ? s.delete(tid) : s.add(tid)
    setSelected(s)
  }

  function exitSelect() { setSelecting(false); setSelected(new Set()) }

  async function openPdf(ticket) {
    try {
      const url = await getTicketUrl(ticket)
      logActivity('bilhete_aberto', { gameId: game.id, ticketId: ticket.id, details: { lugar: seatLabel(ticket) } })
      window.open(url, '_blank')
    } catch {
      alert('Sem permissão para abrir este PDF (só o próprio ou o admin).')
    }
  }

  async function doAssign(userId, guestNote) {
    setBusy(true)
    try {
      const ids = sheet.type === 'assign' ? [...sheet.ids] : [sheet.ticket.id]
      const userName = profiles.find((p) => p.id === userId)?.name
      await assignTickets(ids, userId, guestNote, game.id, userName)
      setSheet(null); exitSelect()
      load()
    } catch (e) { alert(e.message) } finally { setBusy(false) }
  }

  function waShare(text) {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  function gameHeader() {
    return `${game.title} — ${fmtDate(game.match_date)}${game.match_time ? ' às ' + game.match_time : ''}`
  }

  async function doShare(guestName, guestContact) {
    setBusy(true)
    try {
      const tickets = sheet.type === 'bulkshare' ? sheet.tickets : [sheet.ticket]
      const lines = []
      let i = 0
      for (const t of tickets) {
        i++
        setBusyMsg(tickets.length > 1 ? `A criar link ${i}/${tickets.length}…` : 'A criar link…')
        const share = await shareTicket(t, guestName, guestContact, game.match_date)
        lines.push(tickets.length > 1 ? `• ${seatLabel(t)}: ${share.url}` : share.url)
      }
      setSheet(null); exitSelect()
      load()
      const text =
        tickets.length > 1
          ? `Bilhetes ${gameHeader()}:\n${lines.join('\n')}`
          : `Bilhete ${gameHeader()}. ${seatLabel(tickets[0])}. Abre aqui: ${lines[0]}`
      waShare(text)
    } catch (e) { alert(e.message) } finally { setBusy(false); setBusyMsg('') }
  }

  async function doRevoke(share) {
    if (!confirm(`Anular a partilha com ${share.guest_name}? (quem já tiver o link pode ainda abri-lo até expirar)`)) return
    await revokeShare(share)
    load()
  }

  async function doDeleteGame() {
    if (!confirm(`Apagar o jogo "${game.title}" e todos os bilhetes? Esta ação não tem volta.`)) return
    setBusy(true)
    try { await deleteGame(game.id, game.title); nav('/') } catch (e) { alert(e.message); setBusy(false) }
  }

  const activeTicket = sheet?.type === 'ticket' ? sheet.ticket : null
  const activeShare = activeTicket?.shares?.find((s) => !s.revoked)

  function renderSection(title, list, emptyMsg) {
    return (
      <>
        <div className="section-head">
          <span>{title}</span><span className="count">{list.length}</span>
        </div>
        {list.length === 0 && <p className="muted small section-empty">{emptyMsg}</p>}
        {list.map((t) => (
          <TicketRow
            key={t.id} t={t} me={profile?.id} isAdmin={isAdmin}
            selecting={selecting} selected={selected.has(t.id)} selectable={canSelect(t)}
            onToggle={toggle}
            onOpen={(ticket) => setSheet({ type: 'ticket', ticket })}
          />
        ))}
      </>
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <Link to="/" className="back">‹</Link>
        <div>
          <h1>{game.title}</h1>
          <span className="muted">{fmtDate(game.match_date)}{game.match_time ? ` · ${game.match_time}` : ''}</span>
        </div>
        <button className="btn small ghost" onClick={() => (selecting ? exitSelect() : setSelecting(true))}>
          {selecting ? 'Cancelar' : 'Selecionar'}
        </button>
      </header>

      <div className="tabs">
        {cats.map((c) => {
          const n = game.tickets.filter((t) => t.category === c).length
          const a = game.tickets.filter((t) => t.category === c && t.assigned_to).length
          return (
            <button key={c} className={tab === c ? 'active' : ''} onClick={() => setTab(c)}>
              {CATEGORIES[c].emoji} {CATEGORIES[c].label} <small>{a}/{n}</small>
            </button>
          )
        })}
      </div>

      <div className="tickets">
        {renderSection('Por atribuir', groups.unassigned, 'Nenhum bilhete por atribuir nesta categoria.')}
        {renderSection('Atribuídos', groups.assigned, 'Ainda não há bilhetes atribuídos nesta categoria.')}
      </div>

      {isAdmin && !selecting && (
        <div className="pad">
          <button className="btn danger ghost small" onClick={doDeleteGame} disabled={busy}>Apagar jogo</button>
        </div>
      )}

      {selecting && selected.size > 0 && (
        <div className="floatbar">
          <span>{selected.size} ✓</span>
          <div className="floatbar-btns">
            {isAdmin && (
              <button className="btn small" onClick={() => setSheet({ type: 'assign', ids: selected })}>Reservar</button>
            )}
            {canBulkShare && (
              <button className="btn small wa" onClick={() => setSheet({ type: 'bulkshare', tickets: selectedTickets })}>
                Partilhar WhatsApp
              </button>
            )}
          </div>
        </div>
      )}

      {sheet?.type === 'ticket' && (
        <Sheet onClose={() => setSheet(null)} title={seatLabel(activeTicket)}>
          <p className="muted small">
            {activeTicket.zone && <>{activeTicket.zone} · </>}
            {activeTicket.assigned_to ? <>Reservado para <b>{activeTicket.assignee?.name}</b>{activeTicket.guest_note ? ` (${activeTicket.guest_note})` : ''}</> : 'Por atribuir'}
          </p>
          {activeShare && (
            <p className="muted small">📤 Partilhado com <b>{activeShare.guest_name}</b>{activeShare.guest_contact ? ` (${activeShare.guest_contact})` : ''}</p>
          )}
          <div className="sheet-actions">
            {(isAdmin || activeTicket.assigned_to === profile?.id) && (
              <>
                <button className="btn primary" onClick={() => openPdf(activeTicket)}>Ver bilhete (PDF)</button>
                <button className="btn wa" onClick={() => setSheet({ type: 'share', ticket: activeTicket })}>Partilhar por WhatsApp</button>
                {activeShare && (
                  <>
                    <button className="btn ghost" onClick={() => { navigator.clipboard.writeText(activeShare.url); alert('Link copiado.') }}>Copiar link da partilha</button>
                    <button className="btn danger ghost" onClick={() => doRevoke(activeShare)}>Anular partilha</button>
                  </>
                )}
              </>
            )}
            {isAdmin && (
              <>
                <button className="btn" onClick={() => setSheet({ type: 'assign', ids: [activeTicket.id] })}>
                  {activeTicket.assigned_to ? 'Reatribuir' : 'Reservar'}
                </button>
                {activeTicket.assigned_to && (
                  <button className="btn danger ghost" onClick={() => doAssign(null)}>Remover reserva</button>
                )}
              </>
            )}
          </div>
        </Sheet>
      )}

      {sheet?.type === 'assign' && (
        <AssignSheet profiles={profiles} busy={busy} count={sheet.ids.size ?? sheet.ids.length} onAssign={doAssign} onClose={() => setSheet(null)} />
      )}

      {(sheet?.type === 'share' || sheet?.type === 'bulkshare') && (
        <ShareSheet
          busy={busy} busyMsg={busyMsg}
          count={sheet.type === 'bulkshare' ? sheet.tickets.length : 1}
          onShare={doShare} onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}

function Sheet({ title, children, onClose }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}

function AssignSheet({ profiles, count, busy, onAssign, onClose }) {
  const [userId, setUserId] = useState('')
  const [guestNote, setGuestNote] = useState('')
  return (
    <Sheet title={`Reservar ${count > 1 ? count + ' bilhetes' : 'bilhete'}`} onClose={onClose}>
      <label>
        Para quem?
        <select value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">— escolher —</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label>
        Nota (opcional — ex.: nome do convidado final)
        <input value={guestNote} onChange={(e) => setGuestNote(e.target.value)} placeholder="ex.: para o cliente X" />
      </label>
      <div className="sheet-actions">
        <button className="btn primary" disabled={!userId || busy} onClick={() => onAssign(userId, guestNote)}>
          {busy ? 'A reservar…' : 'Confirmar reserva'}
        </button>
      </div>
    </Sheet>
  )
}

function ShareSheet({ busy, busyMsg, count, onShare, onClose }) {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  return (
    <Sheet title={count > 1 ? `Partilhar ${count} bilhetes` : 'Partilhar bilhete'} onClose={onClose}>
      <p className="muted small">
        {count > 1
          ? 'São criados links seguros para os PDFs e abre-se o WhatsApp com tudo pronto a enviar. Fica registado a quem foram.'
          : 'É criado um link seguro para o PDF e abre-se o WhatsApp pronto a enviar. Fica registado a quem foi.'}
      </p>
      <label>
        Nome do convidado
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: João Silva" />
      </label>
      <label>
        Contacto (opcional)
        <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="telemóvel ou email" />
      </label>
      <div className="sheet-actions">
        <button className="btn primary" disabled={!name.trim() || busy} onClick={() => onShare(name.trim(), contact.trim())}>
          {busy ? (busyMsg || 'A criar…') : 'Criar e abrir WhatsApp'}
        </button>
      </div>
    </Sheet>
  )
}
