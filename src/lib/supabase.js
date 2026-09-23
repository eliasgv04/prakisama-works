import { createClient } from '@supabase/supabase-js';

// Solo la URL y la clave "anon" (pública por diseño). Todo el control de acceso lo hace RLS en
// la base de datos: aunque alguien lea esta clave en el navegador, sin sesión no puede hacer nada.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && anonKey);

export const PROFILE_COLUMNS = 'id, email, full_name, active, created_at, updated_at';

export const supabase = configured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      // Las llamadas a la API nunca deben salir de la caché HTTP del navegador: si no, tras guardar
      // algo la pantalla podía mostrar la lista antigua.
      global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    })
  : null;
