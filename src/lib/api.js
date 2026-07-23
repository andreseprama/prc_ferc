import { supabase } from './supabase'

// ---------- atividade ----------
export async function logActivity(action, { gameId = null, ticketId = null, details = {} } = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('activity').insert({
    actor: user?.id ?? null,
    action,
    game_id: gameId,
    ticket_id: ticketId,
    details,
  })
}

// ---------- perfis ----------
export async function fetchProfiles() {
  const { data, error } = await supabase.from('profiles').select('*').order('name')
  if (error) throw error
  return data
}

// ---------- jogos ----------
export async function fetchGames() {
  const { data, error } = await supabase
    .from('games')
    .select('*, tickets(id, category, assigned_to, shares(revoked))')
    .order('match_date', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchGame(id) {
  const { data, error } = await supabase
    .from('games')
    .select('*, tickets(*, assignee:profiles!tickets_assigned_to_fkey(id, name), shares(id, guest_name, guest_contact, url, token, revoked, created_at, shared_by))')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function deleteGame(id, title) {
  // apaga primeiro os ficheiros do storage
  const { data: files } = await supabase.storage.from('tickets').list(id, { limit: 200 })
  if (files?.length) {
    await supabase.storage.from('tickets').remove(files.map((f) => `${id}/${f.name}`))
  }
  const { error } = await supabase.from('games').delete().eq('id', id)
  if (error) throw error
  await logActivity('jogo_apagado', { details: { title } })
}

// ---------- importação ----------
export async function importGame(game, tickets, onProgress) {
  const { data: g, error } = await supabase
    .from('games')
    .insert({
      title: game.title,
      opponent: game.opponent || null,
      competition: game.competition || null,
      match_date: game.date || null,
      match_time: game.time || null,
    })
    .select()
    .single()
  if (error) throw error

  let done = 0
  const failed = []
  for (const t of tickets) {
    try {
      const ticketRow = {
        game_id: g.id,
        category: t.parsed.category || 'bancada',
        zone: t.parsed.zone,
        sector: t.parsed.sector,
        row: t.parsed.row,
        seat: t.parsed.seat,
        gate: t.parsed.gate,
        entrance: t.parsed.entrance,
        floor: t.parsed.floor,
        code: t.parsed.code,
        original_name: t.originalName,
        file_path: '',
      }
      const { data: inserted, error: e1 } = await supabase.from('tickets').insert(ticketRow).select().single()
      if (e1) throw e1
      const path = `${g.id}/${inserted.id}.pdf`
      const { error: e2 } = await supabase.storage
        .from('tickets')
        .upload(path, t.bytes, { contentType: 'application/pdf', upsert: true })
      if (e2) {
        await supabase.from('tickets').delete().eq('id', inserted.id)
        throw e2
      }
      const { error: e3 } = await supabase.from('tickets').update({ file_path: path }).eq('id', inserted.id)
      if (e3) throw e3
    } catch (e) {
      failed.push({ name: t.originalName, error: e.message })
    }
    done++
    onProgress?.(done, tickets.length)
  }
  await logActivity('jogo_importado', {
    gameId: g.id,
    details: { title: g.title, total: tickets.length, falhados: failed.length },
  })
  return { game: g, failed }
}

// ---------- atribuições ----------
export async function assignTickets(ticketIds, userId, guestNote, gameId, userName) {
  const { data: { user } } = await supabase.auth.getUser()
  const patch = userId
    ? { assigned_to: userId, assigned_by: user.id, assigned_at: new Date().toISOString(), guest_note: guestNote || null }
    : { assigned_to: null, assigned_by: null, assigned_at: null, guest_note: null }
  const { error } = await supabase.from('tickets').update(patch).in('id', ticketIds)
  if (error) throw error
  await logActivity(userId ? 'bilhetes_atribuidos' : 'atribuicao_removida', {
    gameId,
    details: { bilhetes: ticketIds.length, para_nome: userName || undefined, nota: guestNote || undefined },
  })
}

// ---------- PDFs ----------
export async function getTicketUrl(ticket, expiresSeconds = 3600) {
  const { data, error } = await supabase.storage
    .from('tickets')
    .createSignedUrl(ticket.file_path, expiresSeconds)
  if (error) throw error
  return data.signedUrl
}

// ---------- partilha com convidados ----------
export function makeShareToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const buf = new Uint8Array(12)
  crypto.getRandomValues(buf)
  return [...buf].map((b) => chars[b % chars.length]).join('')
}

export async function shareTicket(ticket, guestName, guestContact, matchDate, token) {
  const { data: { user } } = await supabase.auth.getUser()
  // link válido até 3 dias depois do jogo (ou 30 dias se não houver data)
  let expiresSeconds = 30 * 24 * 3600
  if (matchDate) {
    const end = new Date(matchDate + 'T23:59:59')
    end.setDate(end.getDate() + 3)
    expiresSeconds = Math.max(3600, Math.floor((end - new Date()) / 1000))
  }
  const { data, error } = await supabase.storage
    .from('tickets')
    .createSignedUrl(ticket.file_path, expiresSeconds)
  if (error) throw error
  const url = data.signedUrl
  const { data: share, error: e2 } = await supabase
    .from('shares')
    .insert({
      ticket_id: ticket.id,
      shared_by: user.id,
      guest_name: guestName,
      guest_contact: guestContact || null,
      url,
      token: token || null,
      expires_at: new Date(Date.now() + expiresSeconds * 1000).toISOString(),
    })
    .select()
    .single()
  if (e2) throw e2
  await logActivity('bilhete_partilhado', {
    gameId: ticket.game_id,
    ticketId: ticket.id,
    details: { convidado: guestName, contacto: guestContact || undefined },
  })
  return share
}

// atualizar o nome do convidado depois do envio (fluxo WhatsApp)
export async function updateShareNames(shareIds, name, contact) {
  const { error } = await supabase
    .from('shares')
    .update({ guest_name: name, guest_contact: contact || null })
    .in('id', shareIds)
  if (error) throw error
  await logActivity('convidado_identificado', {
    details: { convidado: name, partilhas: shareIds.length },
  })
}

export async function revokeShares(shareIds) {
  const { error } = await supabase.from('shares').update({ revoked: true }).in('id', shareIds)
  if (error) throw error
  await logActivity('partilha_anulada', { details: { partilhas: shareIds.length } })
}

export async function revokeShare(share) {
  const { error } = await supabase.from('shares').update({ revoked: true }).eq('id', share.id)
  if (error) throw error
  await logActivity('partilha_anulada', {
    ticketId: share.ticket_id,
    details: { convidado: share.guest_name },
  })
}

// ---------- atividade (listagem) ----------
export async function fetchActivity(limit = 100) {
  const { data, error } = await supabase
    .from('activity')
    .select('*, profile:profiles(name)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

export async function updateProfile(id, patch) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', id)
  if (error) throw error
}

// ---------- gestão de utilizadores (admin) ----------
export async function adminCreateUser(email, password, name, role) {
  const { data, error } = await supabase.rpc('admin_create_user', {
    new_email: email, new_password: password, new_name: name, new_role: role,
  })
  if (error) throw error
  await logActivity('utilizador_criado', { details: { nome: name, email } })
  return data
}

export async function adminDeleteUser(id, name) {
  const { error } = await supabase.rpc('admin_delete_user', { target: id })
  if (error) throw error
  await logActivity('utilizador_apagado', { details: { nome: name } })
}

export async function changeRole(id, role, name) {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
  if (error) throw error
  await logActivity('perfil_alterado', { details: { nome: name, perfil: role === 'admin' ? 'Administrador' : 'Membro' } })
}

export async function changeMyPassword(password) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}
