import { friendlyError } from '../lib/errors.js';
import { sendMagicLink, sendPasswordReset, session, setPassword, signIn } from '../lib/session.js';
import { navigate } from '../router.js';
import { banner, brandHeader, button } from '../ui/components.js';
import { h, toast } from '../ui/dom.js';

export default async function login() {
  const email = h('input', { type: 'email', name: 'email', required: true, autocomplete: 'username', inputmode: 'email', autocapitalize: 'none', placeholder: 'tu@email.com' });
  const password = h('input', { type: 'password', name: 'password', autocomplete: 'current-password', placeholder: 'Contraseña' });
  const message = h('div');
  const submit = button('Entrar', { type: 'submit', block: true });

  const say = (text, kind = 'info') => message.replaceChildren(banner(text, kind));

  const requireEmail = () => {
    if (email.value.trim()) return email.value.trim();
    say('Escribe primero tu email.', 'warn');
    email.focus();
    return null;
  };

  async function run(task, doneText) {
    submit.disabled = true;
    try {
      await task();
      if (doneText) say(doneText, 'info');
    } catch (err) {
      say(friendlyError(err), 'error');
    } finally {
      submit.disabled = false;
    }
  }

  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: (event) => {
        event.preventDefault();
        if (!password.value) return say('Escribe tu contraseña o pide un enlace de acceso.', 'warn');
        run(async () => {
          await signIn(email.value.trim(), password.value);
          if (session.user) navigate('/', { replace: true });
          else say(session.blocked ?? 'No se pudo iniciar sesión.', 'error');
        });
      },
    },
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Email'), email),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Contraseña'), password),
    message,
    submit,
    h(
      'div',
      { class: 'stack tight', style: 'align-items:center' },
      h('button', { class: 'linklike', type: 'button', onclick: () => { const e = requireEmail(); if (e) run(() => sendMagicLink(e), 'Te hemos enviado un enlace de acceso. Ábrelo desde este mismo móvil.'); } }, 'Entrar con un enlace por email'),
      h('button', { class: 'linklike', type: 'button', onclick: () => { const e = requireEmail(); if (e) run(() => sendPasswordReset(e), 'Te hemos enviado un email para cambiar la contraseña.'); } }, 'He olvidado mi contraseña'),
    ),
  );

  const node = h('div', { class: 'login' }, ...brandHeader('Prakisama Works', 'Obras, trabajadores, proveedores y subcontratas de Prakisama.'), session.blocked ? banner(session.blocked, 'error') : null, form);
  return { title: 'Acceso', node, bare: true };
}

/** Pantalla para fijar contraseña tras una invitación o "he olvidado mi contraseña". */
export async function newPassword() {
  const first = h('input', { type: 'password', name: 'new', required: true, minlength: 8, autocomplete: 'new-password' });
  const second = h('input', { type: 'password', name: 'again', required: true, minlength: 8, autocomplete: 'new-password' });
  const save = button('Guardar contraseña', { type: 'submit', block: true });

  const form = h(
    'form',
    {
      class: 'stack',
      onsubmit: async (event) => {
        event.preventDefault();
        if (first.value !== second.value) return toast('Las contraseñas no coinciden.', 'error');
        save.disabled = true;
        try {
          await setPassword(first.value);
          toast('Contraseña guardada', 'success');
          navigate('/', { replace: true });
        } catch (err) {
          toast(friendlyError(err), 'error');
          save.disabled = false;
        }
      },
    },
    h('p', { class: 'muted' }, 'Elige una contraseña de al menos 8 caracteres para entrar la próxima vez.'),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nueva contraseña'), first),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Repítela'), second),
    save,
  );
  return { title: 'Crea tu contraseña', node: h('div', { class: 'login' }, ...brandHeader('Crea tu contraseña'), form), bare: true };
}
