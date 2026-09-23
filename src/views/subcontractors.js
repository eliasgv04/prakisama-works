import { listSubcontractors, saveSubcontractor, setSubcontractorActive } from '../lib/api.js';
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
    { key: 'contact_name', label: 'Persona de contacto (opcional)' },
    { key: 'phone', label: 'Teléfono (opcional)', type: 'tel' },
    { key: 'email', label: 'Email (opcional)', type: 'email' },
  ],
  list: listSubcontractors,
  save: saveSubcontractor,
  setActive: setSubcontractorActive,
});

export const subcontractorsList = list;
export const subcontractorForm = form;
