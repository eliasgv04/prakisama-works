// Cuenta: datos del usuario, cambio de contraseña, equipo (usuarios de la app), cómo instalar la
// app y cerrar sesión. Sin roles: cualquiera puede activar o desactivar a otra persona del equipo.

import { listProfiles, updateProfile } from '../lib/api.js';
import { friendlyError } from '../lib/errors.js';
import { session, setPassword, signOut } from '../lib/session.js';
import { navigate } from '../router.js';
import { accordion } from '../ui/accordion.js';
import { button, section, textField } from '../ui/components.js';
import { h, toast } from '../ui/dom.js';

export default async function account() {
  const profile = session.profile;
  const node = h('div', {});

  node.append(section('Mi cuenta', h('div', { class: 'card' }, h('div', { class: 'strong' }, profile.full_name || profile.email), h('div', { class: 'muted' }, profile.full_name ? profile.email : null))));

  // --- Cambiar contraseña ---
  const first = h('input', { type: 'password', name: 'new', required: true, minlength: 8, autocomplete: 'new-password' });
  const second = h('input', { type: 'password', name: 'again', required: true, minlength: 8, autocomplete: 'new-password' });
  const save = button('Guardar contraseña', { type: 'submit', block: true, iconName: 'check' });
  const pwForm = h(
    'form',
    {
      class: 'stack',
      onsubmit: async (event) => {
        event.preventDefault();
        if (first.value !== second.value) return toast('Las contraseñas no coinciden.', 'error');
        save.disabled = true;
        try {
          await setPassword(first.value);
          toast('Contraseña cambiada', 'success');
        } catch (err) {
          toast(friendlyError(err), 'error');
          save.disabled = false;
        }
      },
    },
    h('p', { class: 'muted' }, 'Elige una contraseña de al menos 8 caracteres.'),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nueva contraseña'), first),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Repítela'), second),
    save,
  );
  node.append(section('Seguridad', accordion({ group: 'cuenta', iconName: 'user', title: 'Cambiar contraseña', summary: 'Para entrar la próxima vez', content: pwForm }).el));

  // --- Equipo ---
  const profiles = await listProfiles();
  node.append(section('Equipo', usersCard(profiles).el));

  // --- Instalación ---
  node.append(
    section(
      'Instalar la app',
      h(
        'div',
        { class: 'card' },
        h(
          'details',
          {},
          h('summary', { class: 'strong', style: 'min-height:44px;display:flex;align-items:center' }, 'Añadir a la pantalla de inicio'),
          h(
            'div',
            { class: 'muted stack tight' },
            h('p', {}, 'Android (Chrome): menú ⋮ → "Instalar aplicación" o "Añadir a pantalla de inicio".'),
            h('p', {}, 'iPhone (Safari): botón Compartir → "Añadir a pantalla de inicio". Tiene que ser Safari.'),
            h('p', {}, 'Instalada se abre a pantalla completa, como una app, y arranca más rápido.'),
          ),
        ),
      ),
    ),
  );

  node.append(h('div', { class: 'spacer' }), button('Cerrar sesión', { variant: 'ghost', block: true, onClick: async () => { await signOut(); navigate('/login', { replace: true }); } }));

  return { title: 'Cuenta', tab: 'cuenta', node };
}

function usersSummary(profiles) {
  const active = profiles.filter((p) => p.active).length;
  return { summary: `${active} ${active === 1 ? 'usuario activo' : 'usuarios activos'}`, warn: active === 0 };
}

function usersCard(profiles) {
  const subs = profiles.map((profile) => userCard(profile, () => card.set(usersSummary(profiles))));
  const card = accordion({
    group: 'top',
    iconName: 'users',
    title: 'Usuarios',
    ...usersSummary(profiles),
    content: [
      h('p', { class: 'muted' }, 'Todos los usuarios tienen los mismos permisos. Si alguien deja de trabajar con la app, desactiva su cuenta.'),
      ...subs.map((s) => s.el),
      h('p', { class: 'muted', style: 'margin-top:12px' }, 'Para dar de alta a alguien nuevo, créalo en Supabase (Authentication → Users → Add user) y pásale su contraseña: podrá cambiarla en Cuenta.'),
    ],
  });
  return card;
}

function userCard(profile, onSaved) {
  const isMe = profile.id === session.user?.id;
  const describe = (p) => ({ summary: [p.full_name ? p.email : null, p.active ? null : 'desactivado', isMe ? 'eres tú' : null].filter(Boolean).join(' · ') || 'Activo', warn: !p.active });

  const nameField = textField('Nombre', 'full_name', { value: profile.full_name ?? '', placeholder: 'Para reconocerlo en la lista' });
  const active = isMe ? null : h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'active', checked: profile.active }), 'Cuenta activa (puede entrar en la app)');
  const save = button('Guardar', {
    block: true,
    iconName: 'check',
    onClick: () => {
      const patch = { full_name: nameField.querySelector('input').value.trim() || null };
      if (active) patch.active = active.querySelector('input').checked;
      save.disabled = true;
      updateProfile(profile.id, patch)
        .then(() => {
          Object.assign(profile, patch);
          card.set(describe(profile));
          onSaved();
          toast('Usuario actualizado', 'success');
        })
        .catch((err) => toast(friendlyError(err), 'error'))
        .finally(() => { save.disabled = false; });
    },
  });
  const content = h('div', { class: 'stack' }, h('p', { class: 'muted small' }, profile.email), nameField, active, isMe ? h('p', { class: 'muted small' }, 'Es tu cuenta: no puedes desactivarla.') : null, save);
  const card = accordion({ group: 'users', sub: true, title: profile.full_name || profile.email, ...describe(profile), content });
  return card;
}
