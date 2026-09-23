// Utilidades de red.

/**
 * Rechaza si `promise` tarda más de `ms`. El mensaje incluye "Failed to fetch" para que
 * isNetworkError() lo trate como falta de conexión.
 */
export function withTimeout(promise, ms) {
  // Los query builders de supabase-js son "thenables" (tienen .then) pero no Promises completas
  // (no tienen .catch/.finally): hay que envolverlos con Promise.resolve() antes de usarlos como tal.
  const real = Promise.resolve(promise);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Failed to fetch (tiempo de espera agotado)')), ms);
  });
  real.catch(() => {}); // si pierde la carrera, que no quede un rechazo sin atender
  return Promise.race([real, timeout]).finally(() => clearTimeout(timer));
}
