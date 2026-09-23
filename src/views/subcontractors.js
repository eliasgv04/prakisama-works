import { deleteSubcontractor, listSubcontractors, saveSubcontractor, setSubcontractorActive } from '../lib/api.js';
import { makeEntityViews } from './simpleEntity.js';

const { list, form } = makeEntityViews({
  singular: 'subcontrata',
  plural: 'Subcontratas',
  route: '/subcontratas',
  iconName: 'wrench',
  nameField: 'name',
  nameLabel: 'Nombre',
  fields: [
    { key: 'nif', label: 'CIF/NIF (opcional)' },
    { key: 'phone', label: 'Teléfono (opcional)', type: 'tel' },
    { key: 'email', label: 'Email (opcional)', type: 'email' },
    { key: 'address', label: 'Dirección (opcional)', listable: false },
  ],
  list: listSubcontractors,
  save: saveSubcontractor,
  setActive: setSubcontractorActive,
  delete: deleteSubcontractor,
});

export const subcontractorsList = list;
export const subcontractorForm = form;
