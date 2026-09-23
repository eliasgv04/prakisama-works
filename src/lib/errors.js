// Traduce errores técnicos (Supabase, red, Postgres) a mensajes comprensibles en español.

export const isNetworkError = (err) =>
  !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(String(err?.message ?? err));

const AUTH_MESSAGES = [
  [/invalid login credentials/i, 'Email o contraseña incorrectos.'],
  [/email not confirmed/i, 'Tu email todavía no está confirmado.'],
  [/signups? not allowed|user not found/i, 'Ese email no tiene acceso. Pide que te den de alta como usuario.'],
  [/rate limit|too many requests|after \d+ seconds/i, 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.'],
  [/password should be at least/i, 'La contraseña debe tener al menos 8 caracteres.'],
  [/same password|different from the old/i, 'La nueva contraseña debe ser distinta de la anterior.'],
];

export function friendlyError(err) {
  if (isNetworkError(err)) return 'Sin conexión. Comprueba tu cobertura e inténtalo de nuevo.';
  const message = String(err?.message ?? err ?? 'Error desconocido');
  const code = err?.code;
  if (code === '23505') return 'Ese registro ya existe.';
  if (code === '23503') return 'No se puede borrar: hay datos que dependen de esto.';
  if (code === '42501' || /row-level security|permission denied|not authorized|no autorizado/i.test(message)) {
    return 'No tienes permiso para hacer esto.';
  }
  // .single() sobre una fila que la RLS no deja ver/modificar: PostgREST responde "0 filas".
  if (code === 'PGRST116') return 'No tienes permiso para hacer esto, o el elemento ya no existe.';
  if (code === '23514') return 'Alguno de los valores no es válido. Revisa el formulario.';
  for (const [pattern, text] of AUTH_MESSAGES) if (pattern.test(message)) return text;
  return message;
}
