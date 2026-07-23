import { useEffect, useMemo, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { fetchGame, fetchProfiles, assignTickets, getTicketUrl, shareTicket, revokeShare, updateShareNames, revokeShares, deleteGame, logActivity, makeShareToken, addKid, removeKid } from '../lib/api'
import { seatLabel } from '../lib/parseTicket'
import { CATEGORIES, COMPANIES, fmtDate, isTaken, ticketCompany } from '../lib/format'
import { useAuth } from '../AuthContext'
import CatIcon from '../components/CatIcon'
import { openWhatsApp } from '../lib/wa'

function initials(name) {
  if (!name) return ''
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

function TicketTile({ t, me, isAdmin, selected, selecting, selectable, onToggle, onOpen, showPlace, hideWho }) {
  const mine = t.assigned_to === me
  const share = t.shares?.find((s) => !s.revoked)
  const state = share ? 'sent' : t.assigned_to ? 'reserved' : 'free'
  let line1, line2
  if (t.category === 'parque') {
    line1 = 'P'
    line2 = t.entrance || 'Parque'
  } else {
    line1 = t.seat ? `L${t.seat}` : '—'
    // agrupado por lugar: a fila está no cabeçalho; agrupado por pessoa: mostra o lugar completo
    line2 = showPlace ? [t.sector && `S${t.sector}`, t.row && `F${t.row}`].filter(Boolean).join(' · ') || t.zone : null
  }
  const who = hideWho ? null : share ? initials(share.guest_name) : t.assigned_to ? initials(t.assignee?.name) : null
  const cmp = ticketCompany(t)
  return (
    <button
      className={`tile st-${state} ${selected ? 'selected' : ''} ${selecting && !selectable ? 'dim' : ''} ${mine ? 'is-mine' : ''}`}
      onClick={() => (selecting ? (selectable && onToggle(t.id)) : onOpen(t))}
      title={seatLabel(t)}
    >
      {selecting && <span className={`tile-check ${selected ? 'on' : ''}`}>{selected ? '✓' : ''}</span>}
      <span className="tile-l1">{line1}</span>
      {line2 && <span className="tile-l2">{line2}</span>}
      {who && <span className={`tile-who ${cmp ? 'cmp-' + cmp : ''}`}>{who}</span>}
    </button>
  )
}

export default function GameDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { profile, isAdmin } = useAuth()
  const [game, setGame] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [tab, setTab] = useState('camarote')
  const [error, setError] = useState(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [sheet, setSheet] = useState(null) // {type:'ticket'|'assign'|'share'|'bulkshare', ...}
  const [busy, setBusy] = useState(false)
  const [busyMsg, setBusyMsg] = useState('')

  const load = useCallback(() => {
    fetchGame(id).then(setGame).catch((e) => setError(e.message))
  }, [id])

  useEffect(() => {
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [load])
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
    return ['camarote', 'parque', 'bancada'].filter((c) => present.includes(c))
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
    // O link curto é gerado localmente, por isso o WhatsApp abre LOGO (sem páginas em branco);
    // os bilhetes são preparados em segundo plano enquanto o utilizador escolhe o contacto.
    const token = makeShareToken()
    const shortLink = `${location.origin}${location.pathname}#/c/${token}`
    const text =
      tickets.length > 1
        ? `${tickets.length} bilhetes para ${gameHeader()}. Abre aqui: ${shortLink}`
        : `Bilhete para ${gameHeader()} (${seatLabel(tickets[0])}). Abre aqui: ${shortLink}`
    openWhatsApp(text, guestTel)
    setBusy(true)
    try {
      const shareIds = []
      let i = 0
      for (const t of tickets) {
        i++
        setBusyMsg(tickets.length > 1 ? `A preparar ${i}/${tickets.length}…` : 'A preparar…')
        const share = await shareTicket(t, guestName || 'Convidado (WhatsApp)', null, game.match_date, token)
        shareIds.push(share.id)
      }
      exitSelect()
      load()
      // sem seletor de contactos (iPhone): perguntar o nome quando voltar à app
      setSheet(guestName ? null : { type: 'nameAfter', shareIds, count: tickets.length })
    } catch (e) {
      alert(`Atenção: não foi possível preparar os bilhetes — o link enviado NÃO vai funcionar. Apaga a mensagem no WhatsApp e tenta outra vez. (${e.message})`)
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
    if (!confirm(`Anular a partilha com ${share.guest_name}? O link deixa de funcionar.`)) return
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

  function toggleAll(list) {
    const ids = list.filter(canSelect).map((t) => t.id)
    const s = new Set(selected)
    const allIn = ids.length > 0 && ids.every((id) => s.has(id))
    ids.forEach((id) => (allIn ? s.delete(id) : s.add(id)))
    setSelected(s)
  }

  // agrupa os bilhetes por setor+fila (bancadas e camarote); parque fica numa grelha única
  function renderRowGroups(list) {
    const groupsMap = new Map()
    for (const t of list) {
      const key = t.category === 'parque'
        ? 'parque'
        : [t.zone, t.sector, t.row].filter(Boolean).join('|') || 'outros'
      if (!groupsMap.has(key)) groupsMap.set(key, { t, items: [] })
      groupsMap.get(key).items.push(t)
    }
    const label = (t) => {
      if (t.category === 'parque') return null
      const bits = []
      if (t.category === 'camarote') { if (t.zone) bits.push(t.zone) }
      else if (t.sector) bits.push(`Setor ${t.sector}`)
      if (t.row) bits.push(`Fila ${t.row}`)
      return bits.join(' · ') || t.zone || null
    }
    return [...groupsMap.values()].map(({ t, items }, i) => (
      <div className="row-group" key={i}>
        {label(t) && <div className="row-head">{label(t)}</div>}
        <div className="tile-grid">
          {items.map((tk) => (
            <TicketTile
              key={tk.id} t={tk} me={profile?.id} isAdmin={isAdmin}
              selecting={selecting} selected={selected.has(tk.id)} selectable={canSelect(tk)}
              onToggle={toggle}
              onOpen={(ticket) => setSheet({ type: 'ticket', ticket })}
            />
          ))}
        </div>
      </div>
    ))
  }

  // agrupa por pessoa (reservados: membro; enviados: convidado) com o nome bem visível
  function renderPersonGroups(list, kind) {
    const map = new Map()
    for (const t of list) {
      const share = (t.shares || []).find((s) => !s.revoked)
      const key = kind === 'sent' ? `g:${share?.guest_name || '—'}` : `m:${t.assignee?.id || '—'}`
      if (!map.has(key)) map.set(key, { t, share, items: [] })
      map.get(key).items.push(t)
    }
    const groupsArr = [...map.values()].map((g) => ({
      ...g,
      label: kind === 'sent' ? (g.share?.guest_name || 'Convidado') : (g.t.assignee?.name || '—'),
    })).sort((a, b) => a.label.localeCompare(b.label))
    return groupsArr.map(({ t, items, label }, i) => {
      const cmp = ticketCompany(t)
      return (
        <div className="row-group" key={i}>
          <div className="row-head person">
            <span className="person-label">{label}</span>
            {cmp && <span className={`chip cmp-chip cmp-${cmp}`}>{COMPANIES[cmp].label}</span>}
            <span className="count">{items.length}</span>
          </div>
          <div className="tile-grid">
            {items.sort(sortT).map((tk) => (
              <TicketTile
                key={tk.id} t={tk} me={profile?.id} isAdmin={isAdmin} showPlace hideWho
                selecting={selecting} selected={selected.has(tk.id)} selectable={canSelect(tk)}
                onToggle={toggle}
                onOpen={(ticket) => setSheet({ type: 'ticket', ticket })}
              />
            ))}
          </div>
        </div>
      )
    })
  }

  function renderSection(title, list, emptyMsg, kind) {
    const selectableCount = list.filter(canSelect).length
    return (
      <section className={`sec sec-${kind || 'free'}`}>
        <div className="section-head">
          <span className="sec-dot" />
          <span>{title}</span><span className="count">{list.length}</span>
          {selecting && selectableCount > 0 && (
            <button className="link-btn" onClick={() => toggleAll(list)}>
              {list.filter(canSelect).every((t) => selected.has(t.id)) ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
          )}
        </div>
        {list.length === 0 && <p className="muted small section-empty">{emptyMsg}</p>}
        {list.length > 0 && (kind ? renderPersonGroups(list, kind) : renderRowGroups(list))}
      </section>
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
              <CatIcon cat={c} size={15} /> {CATEGORIES[c].label} <small>{a}/{n}</small>
            </button>
          )
        })}
      </div>

      <CompanySummary tickets={game.tickets.filter((t) => t.category === tab)} />

      <div className="tickets">
        {renderSection('Por atribuir', groups.unassigned, 'Nenhum bilhete por atribuir nesta categoria.')}
        {renderSection('Reservados', groups.reserved, 'Sem reservas nesta categoria.', 'reserved')}
        {renderSection('Enviados', groups.sent, 'Nenhum bilhete enviado a convidados nesta categoria.', 'sent')}
      </div>

      {tab === 'camarote' && (
        <KidsCard
          kids={game.kids || []} game={game} me={profile?.id} isAdmin={isAdmin}
          onChange={load}
        />
      )}

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
            <p className="muted small">Enviado a <b>{activeShare.guest_name}</b>{activeShare.guest_contact ? ` (${activeShare.guest_contact})` : ''}</p>
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
                    <button className="btn ghost" onClick={() => { navigator.clipboard.writeText(activeShare.token ? `${location.origin}${location.pathname}#/c/${activeShare.token}` : activeShare.url); alert('Link copiado.') }}>Copiar link da partilha</button>
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

// contagem por empresa (bilhetes ocupados da categoria atual)
function CompanySummary({ tickets }) {
  const counts = { procarro: 0, fercopor: 0 }
  let taken = 0
  for (const t of tickets) {
    if (!isTaken(t)) continue
    taken++
    const c = ticketCompany(t)
    if (c && counts[c] !== undefined) counts[c]++
  }
  if (!taken) return null
  return (
    <div className="cmp-summary">
      {Object.entries(COMPANIES).map(([key, c]) => (
        <span key={key} className={`chip cmp-chip cmp-${key}`}>{c.label} · {counts[key]}</span>
      ))}
      {taken - counts.procarro - counts.fercopor > 0 && (
        <span className="chip">Sem empresa · {taken - counts.procarro - counts.fercopor}</span>
      )}
    </div>
  )
}

// extra do camarote: 2 crianças sem bilhete, com nome e data de nascimento
function KidsCard({ kids, game, me, isAdmin, onChange }) {
  const [name, setName] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [busy, setBusy] = useState(false)
  const MAX = 2

  const fmtBirth = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-PT') : null)

  async function add() {
    if (!name.trim()) return
    if (!birthdate) { alert('Indica a data de nascimento.'); return }
    setBusy(true)
    try { await addKid(game.id, name.trim(), birthdate); setName(''); setBirthdate(''); onChange() }
    catch (e) { alert(e.message) } finally { setBusy(false) }
  }
  async function remove(k) {
    if (!confirm(`Remover ${k.name}?`)) return
    try { await removeKid(k); onChange() } catch (e) { alert(e.message) }
  }

  async function sendToPorto() {
    const lines = kids.map((k) => `• ${k.name}${k.birthdate ? ` — ${fmtBirth(k.birthdate)}` : ''}`)
    const text = `Crianças para o camarote (extra sem bilhete)\n${game.title} — ${fmtDate(game.match_date)}${game.match_time ? ' às ' + game.match_time : ''}:\n${lines.join('\n')}`
    openWhatsApp(text)
    try {
      await markKidsSent(kids.map((k) => k.id), game.id, kids.length)
      onChange()
    } catch (e) { alert(e.message) }
  }

  const allSent = kids.length > 0 && kids.every((k) => k.sent_at)
  const pendingCount = kids.filter((k) => !k.sent_at).length
  const lastSent = kids.filter((k) => k.sent_at).map((k) => k.sent_at).sort().pop()

  return (
    <div className="kids-card">
      <div className="section-head" style={{ margin: '0 0 6px' }}>
        <span>Crianças — extra sem bilhete</span><span className="count">{kids.length}/{MAX}</span>
      </div>
      {kids.map((k) => (
        <div key={k.id} className="kid-row">
          <span>
            {k.name}
            {k.birthdate ? <span className="muted small"> · {fmtBirth(k.birthdate)}</span> : null}
            {k.adder?.name ? <span className="muted small"> · com {k.adder.name}</span> : null}
            {' '}
            {k.sent_at
              ? <span className="kid-sent">✓ enviado</span>
              : <span className="kid-pending">por enviar</span>}
          </span>
          {(isAdmin || k.added_by === me) && (
            <button className="x-btn" onClick={() => remove(k)}>✕</button>
          )}
        </div>
      ))}
      {kids.length < MAX ? (
        <div className="kid-add">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da criança" />
          <input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} max={new Date().toISOString().slice(0, 10)} title="Data de nascimento" />
          <button className="btn small" onClick={add} disabled={busy || !name.trim()}>OK</button>
        </div>
      ) : (
        <p className="muted small" style={{ margin: '4px 0 0' }}>Limite do camarote atingido.</p>
      )}
      {allSent && (
        <p className="muted small" style={{ margin: '8px 0 0' }}>
          ✓ Dados enviados por WhatsApp em {new Date(lastSent).toLocaleDateString('pt-PT')} às {new Date(lastSent).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
      {kids.length > 0 && (
        <button className={`btn small ${allSent ? 'ghost' : 'wa'}`} style={{ marginTop: 8 }} onClick={sendToPorto}>
          {allSent ? 'Reenviar por WhatsApp' : pendingCount < kids.length ? `Enviar por WhatsApp (${pendingCount} por enviar)` : 'Enviar dados por WhatsApp'}
        </button>
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
          {Object.entries(COMPANIES).map(([key, c]) => {
            const list = profiles.filter((p) => (p.company || 'procarro') === key)
            return list.length ? (
              <optgroup key={key} label={c.label}>
                {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </optgroup>
            ) : null
          })}
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
