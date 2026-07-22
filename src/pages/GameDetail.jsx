import { useEffect, useMemo, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { fetchGame, fetchProfiles, assignTickets, getTicketUrl, shareTicket, revokeShare, updateShareNames, revokeShares, deleteGame, logActivity } from '../lib/api'
import { seatLabel } from '../lib/parseTicket'
import { CATEGORIES, fmtDate, isTaken } from '../lib/format'
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
            : share ? null : 'Por atribuir'}
          {share && <>{t.assigned_to ? ' · ' : ''}📤 Enviado a <b>{share.guest_name}</b></>}
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
    const hasShare = (t) => (t.shares || []).some((s) => !s.revoked)
    return {
      unassigned: list.filter((t) => !isTaken(t)).sort(sortT),
      reserved: list.filter((t) => t.assigned_to && !hasShare(t)).sort(sortT),
      sent: list.filter((t) => hasShare(t)).sort(sortT),
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
  const allTickets = [...groups.unassigned, ...groups.reserved, ...groups.sent]
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

  function gameHeader() {
    return `${game.title} — ${fmtDate(game.match_date)}${game.match_time ? ' às ' + game.match_time : ''}`
  }

  // normaliza um número de telefone para o formato wa.me (só dígitos, com indicativo)
  function normTel(raw) {
    if (!raw) return null
    let d = String(raw).replace(/\D/g, '')
    if (d.startsWith('00')) d = d.slice(2)
    if (d.length === 9 && /^9/.test(d)) d = '351' + d // telemóvel PT sem indicativo
    return d.length >= 9 ? d : null
  }

  // Fluxo pedido: tocar em "Partilhar WhatsApp" vai direto aos contactos.
  // Android (Chrome): seletor de contactos do telefone → capta o nome e abre o chat da pessoa.
  // iPhone: abre o WhatsApp na lista de contactos; ao voltar, a app pergunta a quem foi enviado.
  async function startShare(tickets) {
    let guestName = null
    let guestTel = null
    if (navigator.contacts?.select) {
      try {
        const picked = await navigator.contacts.select(['name', 'tel'])
        if (!picked?.length) return
        guestName = picked[0].name?.[0] || null
        guestTel = normTel(picked[0].tel?.[0])
      } catch { return } // cancelado
    }
    // abrir a janela já (antes dos passos assíncronos), para o iOS não bloquear o pop-up
    const w = window.open('', '_blank')
    setBusy(true)
    try {
      const lines = []
      const shareIds = []
      let i = 0
      for (const t of tickets) {
        i++
        setBusyMsg(tickets.length > 1 ? `A criar link ${i}/${tickets.length}…` : 'A criar link…')
        const share = await shareTicket(t, guestName || 'Convidado (WhatsApp)', null, game.match_date)
        shareIds.push(share.id)
        lines.push(tickets.length > 1 ? `• ${seatLabel(t)}: ${share.url}` : share.url)
      }
      const text =
        tickets.length > 1
          ? `Bilhetes ${gameHeader()}:\n${lines.join('\n')}`
          : `Bilhete ${gameHeader()}. ${seatLabel(tickets[0])}. Abre aqui: ${lines[0]}`
      const wa = guestTel
        ? `https://wa.me/${guestTel}?text=${encodeURIComponent(text)}`
        : `https://wa.me/?text=${encodeURIComponent(text)}`
      if (w) w.location = wa
      else window.location.href = wa
      exitSelect()
      load()
      // sem seletor de contactos (iPhone): perguntar o nome quando voltar à app
      setSheet(guestName ? null : { type: 'nameAfter', shareIds, count: tickets.length })
    } catch (e) {
      w?.close()
      alert(e.message)
    } finally { setBusy(false); setBusyMsg('') }
  }

  async function doNameAfter(name, contact) {
    setBusy(true)
    try {
      await updateShareNames(sheet.shareIds, name, contact)
      setSheet(null)
      load()
    } catch (e) { alert(e.message) } finally { setBusy(false) }
  }

  async function doUndoShare() {
    setBusy(true)
    try {
      await revokeShares(sheet.shareIds)
      setSheet(null)
      load()
    } catch (e) { alert(e.message) } finally { setBusy(false) }
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
          const a = game.tickets.filter((t) => t.category === c && isTaken(t)).length
          return (
            <button key={c} className={tab === c ? 'active' : ''} onClick={() => setTab(c)}>
              {CATEGORIES[c].emoji} {CATEGORIES[c].label} <small>{a}/{n}</small>
            </button>
          )
        })}
      </div>

      <div className="tickets">
        {renderSection('Por atribuir', groups.unassigned, 'Nenhum bilhete por atribuir nesta categoria.')}
        {renderSection('Reservados', groups.reserved, 'Sem reservas nesta categoria.')}
        {renderSection('Enviados', groups.sent, 'Nenhum bilhete enviado a convidados nesta categoria.')}
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
              <button className="btn small wa" disabled={busy} onClick={() => startShare(selectedTickets)}>
                {busy ? (busyMsg || 'A criar…') : 'Partilhar WhatsApp'}
              </button>
            )}
          </div>
        </div>
      )}

      {sheet?.type === 'ticket' && (
        <Sheet onClose={() => setSheet(null)} title={seatLabel(activeTicket)}>
          <p className="muted small">
            {activeTicket.zone && <>{activeTicket.zone} · </>}
            {activeTicket.assigned_to
              ? <>Reservado para <b>{activeTicket.assignee?.name}</b>{activeTicket.guest_note ? ` (${activeTicket.guest_note})` : ''}</>
              : activeShare ? 'Enviado a convidado' : 'Por atribuir'}
          </p>
          {activeShare && (
            <p className="muted small">📤 Partilhado com <b>{activeShare.guest_name}</b>{activeShare.guest_contact ? ` (${activeShare.guest_contact})` : ''}</p>
          )}
          <div className="sheet-actions">
            {(isAdmin || activeTicket.assigned_to === profile?.id) && (
              <>
                <button className="btn primary" onClick={() => openPdf(activeTicket)}>Ver bilhete (PDF)</button>
                <button className="btn wa" disabled={busy} onClick={() => { const t = activeTicket; setSheet(null); startShare([t]) }}>
                  {busy ? (busyMsg || 'A criar…') : 'Partilhar por WhatsApp'}
                </button>
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

      {sheet?.type === 'nameAfter' && (
        <NameAfterSheet
          busy={busy} count={sheet.count}
          onSave={doNameAfter} onUndo={doUndoShare}
          onClose={() => setSheet(null)}
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

function NameAfterSheet({ busy, count, onSave, onUndo, onClose }) {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  return (
    <Sheet title="A quem enviaste?" onClose={onClose}>
      <p className="muted small">
        {count > 1 ? `Enviaste ${count} bilhetes por WhatsApp.` : 'Enviaste 1 bilhete por WhatsApp.'}{' '}
        Escreve o nome do contacto para ficar registado.
      </p>
      <label>
        Nome do contacto
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: João Silva" autoFocus />
      </label>
      <label>
        Telemóvel (opcional)
        <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="ex.: 912 345 678" />
      </label>
      <div className="sheet-actions">
        <button className="btn primary" disabled={!name.trim() || busy} onClick={() => onSave(name.trim(), contact.trim())}>
          {busy ? 'A guardar…' : 'Guardar'}
        </button>
        <button className="btn danger ghost" disabled={busy} onClick={onUndo}>Afinal não enviei — anular</button>
      </div>
    </Sheet>
  )
}
