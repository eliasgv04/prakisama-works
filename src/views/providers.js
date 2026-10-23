import { deleteProvider, listProviders, saveProvider, setProviderActive } from '../lib/api.js';
import { makeEntityViews } from './simpleEntity.js';

const { list, form } = makeEntityViews({
  singular: 'proveedor',
  plural: 'Proveedores',
  route: '/proveedores',
  iconName: 'truck',
  pageSize: 30,
  nameField: 'name',
  nameLabel: 'Nombre',
  fields: [
    { key: 'nif', label: 'CIF/NIF (opcional)' },
    { key: 'phone', label: 'Teléfono (opcional)', type: 'tel' },
    { key: 'email', label: 'Email (opcional)', type: 'email' },
    { key: 'address', label: 'Dirección (opcional)', listable: false },
  ],
  list: listProviders,
  save: saveProvider,
  setActive: setProviderActive,
  delete: deleteProvider,
});

export const providersList = list;
export const providerForm = form;
