import account from './views/account.js';
import bankDetail from './views/bankDetail.js';
import bankForm from './views/bankForm.js';
import banksList from './views/banks.js';
import dashboard from './views/dashboard.js';
import listas from './views/listas.js';
import login, { newPassword } from './views/login.js';
import { providerForm, providersList } from './views/providers.js';
import projectDetail from './views/projectDetail.js';
import projectForm from './views/projectForm.js';
import projectsList from './views/projects.js';
import { subcontractorForm, subcontractorsList } from './views/subcontractors.js';
import workHours from './views/workHours.js';
import workerDetail from './views/workerDetail.js';
import workerForm from './views/workerForm.js';
import workersList from './views/workers.js';

// El orden importa: "/obras/nueva" debe ir antes de "/obras/:id".
export const routes = [
  { path: '/login', load: login, public: true },
  { path: '/nueva-clave', load: newPassword },
  { path: '/', load: dashboard },

  { path: '/obras', load: projectsList },
  { path: '/obras/nueva', load: projectForm },
  { path: '/obras/:id', load: projectDetail },
  { path: '/obras/:id/editar', load: projectForm },

  { path: '/horas', load: workHours },

  { path: '/listas', load: listas },
  { path: '/trabajadores', load: workersList },
  { path: '/trabajadores/nuevo', load: workerForm },
  { path: '/trabajadores/:id', load: workerDetail },
  { path: '/trabajadores/:id/editar', load: workerForm },
  { path: '/proveedores', load: providersList },
  { path: '/proveedores/nuevo', load: providerForm },
  { path: '/proveedores/:id', load: providerForm },
  { path: '/subcontratas', load: subcontractorsList },
  { path: '/subcontratas/nuevo', load: subcontractorForm },
  { path: '/subcontratas/:id', load: subcontractorForm },
  { path: '/bancos', load: banksList },
  { path: '/bancos/nuevo', load: bankForm },
  { path: '/bancos/:id', load: bankDetail },
  { path: '/bancos/:id/editar', load: bankForm },

  { path: '/cuenta', load: account },
];
