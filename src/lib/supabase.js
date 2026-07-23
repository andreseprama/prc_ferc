import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

export const isConfigured =
  SUPABASE_URL.startsWith('https://') && !SUPABASE_ANON_KEY.includes('__')

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // manter a sessão guardada no dispositivo e renová-la automaticamente
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'bilhetes-procarro-auth',
      },
    })
  : null
