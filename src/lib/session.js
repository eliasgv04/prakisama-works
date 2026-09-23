// Sesión y perfil del usuario actual.

import { friendlyError } from './errors.js';
import { withTimeout } from './net.js';
import { PROFILE_COLUMNS, supabase } from './supabase.js';

/** Estado observable de la sesión (objeto único y mutable). */
export const session = {
  user: null,
  profile: null,
  /** true tras abrir un enlace de invitación o de recuperación: hay que fijar contraseña */
  needsPassword: false,
  /** motivo por el que se ha cerrado la sesión automáticamente */
  blocked: null,
};

const listeners = new Set();
export function onSessionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn(session));

/** Aplica un usuario autenticado: carga su perfil y bloquea cuentas sin perfil o desactivadas. */
async function applyUser(user) {
  const { data: profile, error } = await withTimeout(supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).maybeSingle(), 8000);
  if (error) throw error;
  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    Object.assign(session, { user: null, profile: null, blocked: 'Tu cuenta no está activa. Pide a otra persona del equipo que la reactive.' });
    return;
  }
  Object.assign(session, { user, profile, blocked: null });
}

export async function initSession() {
  // supabase-js consume y borra el hash del enlace de invitación/recuperación: anotamos el tipo antes.
  const linkType = new URLSearchParams(location.hash.replace(/^#/, '')).get('type');

  const { data } = await withTimeout(supabase.auth.getSession(), 8000);
  if (data?.session) {
    await applyUser(data.session.user);
    session.needsPassword = Boolean(session.user) && (linkType === 'invite' || linkType === 'recovery');
  }

  supabase.auth.onAuthStateChange((event, next) => {
    // Importante: no llamar a supabase de forma síncrona dentro de este callback (bloqueo interno).
    setTimeout(async () => {
      if (event === 'SIGNED_OUT') {
        Object.assign(session, { user: null, profile: null, needsPassword: false });
        emit();
      } else if (event === 'PASSWORD_RECOVERY') {
        if (next?.user && session.user?.id !== next.user.id) await applyUser(next.user);
        session.needsPassword = true;
        emit();
      } else if (event === 'SIGNED_IN' && next?.user && session.user?.id !== next.user.id) {
        await applyUser(next.user);
        emit();
      }
    }, 0);
  });
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendlyError(error));
  await applyUser(data.user);
  emit();
}

const redirectUrl = () => location.origin + location.pathname;

export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectUrl() } });
  if (error) throw new Error(friendlyError(error));
}

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
  if (error) throw new Error(friendlyError(error));
}

export async function setPassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(friendlyError(error));
  session.needsPassword = false;
  emit();
}

export async function signOut() {
  await supabase.auth.signOut().catch(() => {});
  Object.assign(session, { user: null, profile: null, needsPassword: false });
  emit();
}
