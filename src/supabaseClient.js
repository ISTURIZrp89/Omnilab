import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export const TABLES = {
  EQUIPOS: 'EQUIPOS',
  RECEPCION: 'RECEPCION',
  BITACORA: 'BITACORA',
  COND_AMB: 'COND_AMB',
  CAJAS: 'CAJAS',
};

export default supabase;