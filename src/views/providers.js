import { listProviders, saveProvider, setProviderActive } from '../lib/api.js';
import { makeEntityViews } from './simpleEntity.js';

const { list, form } = makeEntityViews({
  singular: 'proveedor',
  plural: 'Proveedores',
  route: '/proveedores',
  iconName: 'truck',
  nameField: 'name',
  nameLabel: 'Nombre',
  fields: [
    { key: 'nif', label: 'CIF/NIF (opcional)' },
    { key: 'contact_name', label: 'Persona de contacto (opcional)' },
    { key: 'phone', label: 'Teléfono (opcional)', type: 'tel' },
    { key: 'email', label: 'Email (opcional)', type: 'email' },
  ],
  list: listProviders,
  save: saveProvider,
  setActive: setProviderActive,
});

export const providersList = list;
export const providerForm = form;
