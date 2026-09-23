// Alta y edición de un banco: datos básicos. Los productos se gestionan desde la ficha.

import { listBanks, saveBank, setBankActive } from '../lib/api.js';
import { makeEntityViews } from './simpleEntity.js';

const { form } = makeEntityViews({
  singular: 'banco',
  plural: 'Bancos',
  route: '/bancos',
  iconName: 'euro',
  tab: 'finanzas',
  listBack: null,
  nameField: 'name',
  nameLabel: 'Nombre',
  fields: [
    { key: 'contact_name', label: 'Persona de contacto (opcional)' },
    { key: 'phone', label: 'Teléfono (opcional)', type: 'tel' },
    { key: 'email', label: 'Email (opcional)', type: 'email' },
  ],
  list: listBanks,
  save: saveBank,
  setActive: setBankActive,
});

export default form;
