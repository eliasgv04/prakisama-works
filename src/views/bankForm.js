// Alta y edición de un banco: datos básicos. Los productos se gestionan desde la ficha.

import { deleteBank, listBanks, saveBank, setBankActive } from '../lib/api.js';
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
  delete: deleteBank,
  deleteWarning: 'Se borra de verdad, no se puede deshacer. Se borrarán también todos sus productos (préstamos, avales...), incluidos los avales vinculados a alguna obra.',
});

export default form;
