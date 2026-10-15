// Acceso a datos (Supabase). Todas las llamadas van con la sesión del usuario, así que la RLS de la
// base de datos decide qué puede leer y escribir cada usuario: aquí no se "filtra por seguridad".

import { PROFILE_COLUMNS, supabase } from './supabase.js';

const orThrow = ({ data, error }) => {
  if (error) throw error;
  return data;
};

const byActiveThenName = (nameKey) => (a, b) => (a.active !== b.active ? (a.active ? -1 : 1) : a[nameKey].localeCompare(b[nameKey], 'es'));

// ---------------------------------------------------------------------------
// Ficheros (URLs firmadas: el bucket es privado)
// ---------------------------------------------------------------------------

const urlCache = new Map();

/** Devuelve { ruta: urlFirmada|null } válidas ~1 h. Reutiliza las ya pedidas. */
export async function signedUrls(bucket, paths) {
  const wanted = [...new Set(paths.filter(Boolean))];
  const now = Date.now();
  const missing = wanted.filter((p) => !(urlCache.get(`${bucket}/${p}`)?.exp > now));
  if (missing.length) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(missing, 3600);
    if (!error) {
      for (const row of data) {
        if (row.signedUrl) urlCache.set(`${bucket}/${row.path}`, { url: row.signedUrl, exp: now + 55 * 60_000 });
      }
    }
  }
  return Object.fromEntries(wanted.map((p) => [p, urlCache.get(`${bucket}/${p}`)?.url ?? null]));
}

// ---------------------------------------------------------------------------
// Trabajadores / proveedores: mismo patrón en los dos (listas maestras, baja lógica)
// ---------------------------------------------------------------------------

function listFactory(table, nameKey = 'name') {
  return async () => {
    const rows = orThrow(await supabase.from(table).select('*'));
    return [...rows].sort(byActiveThenName(nameKey));
  };
}
function saveFactory(table) {
  return async (id, fields) => {
    const query = id ? supabase.from(table).update(fields).eq('id', id) : supabase.from(table).insert(fields);
    return orThrow(await query.select().single());
  };
}
function setActiveFactory(table) {
  return async (id, active) => orThrow(await supabase.from(table).update({ active }).eq('id', id).select().single());
}
/** Borrado de verdad (no baja lógica). Las claves foráneas (ON DELETE RESTRICT) impiden borrar algo
 *  con historial real detrás (horas, asignaciones a una obra): en ese caso hay que dar de baja. */
function deleteFactory(table) {
  return async (id) => {
    const deleted = orThrow(await supabase.from(table).delete().eq('id', id).select());
    if (deleted.length === 0) throw new Error('No tienes permiso para borrar esto.');
  };
}

export const listWorkers = listFactory('workers', 'full_name');
export const saveWorker = saveFactory('workers');
export const setWorkerActive = setActiveFactory('workers');
export const deleteWorker = deleteFactory('workers');

export const listProviders = listFactory('providers');
export const saveProvider = saveFactory('providers');
export const setProviderActive = setActiveFactory('providers');
export const deleteProvider = deleteFactory('providers');

export const listBanks = listFactory('banks');
export const saveBank = saveFactory('banks');
export const setBankActive = setActiveFactory('banks');
export const deleteBank = deleteFactory('banks');

// ---------------------------------------------------------------------------
// Finanzas: productos de cada banco
// ---------------------------------------------------------------------------

// Los dos joins (banco y obra) se piden siempre juntos: este mismo producto se ve tanto desde la
// ficha del banco (necesita `project`) como desde la ficha de la obra si es un aval (necesita `bank`).
const BANK_PRODUCT_SELECT = '*, project:projects(id,name,active), bank:banks(id,name,active)';

export async function listBankProducts(bankId) {
  return orThrow(await supabase.from('bank_products').select(BANK_PRODUCT_SELECT).eq('bank_id', bankId).order('end_date', { ascending: true, nullsFirst: false }));
}
export async function addBankProduct(fields) {
  return orThrow(await supabase.from('bank_products').insert(fields).select(BANK_PRODUCT_SELECT).single());
}
export async function updateBankProduct(id, patch) {
  return orThrow(await supabase.from('bank_products').update(patch).eq('id', id).select(BANK_PRODUCT_SELECT).single());
}
export async function deleteBankProduct(id) {
  const deleted = orThrow(await supabase.from('bank_products').delete().eq('id', id).select());
  if (deleted.length === 0) throw new Error('No tienes permiso para borrar esto.');
}

/** Todos los productos (banco, obra vinculada, fecha de fin), para el semáforo de bancos y el panel. */
export async function listAllBankProducts() {
  return orThrow(await supabase.from('bank_products').select('id, bank_id, name, end_date, project_id, project:projects(id,name,active)'));
}

/** Productos (avales, normalmente) vinculados a una obra concreta. */
export async function listBankProductsByProject(projectId) {
  return orThrow(await supabase.from('bank_products').select(BANK_PRODUCT_SELECT).eq('project_id', projectId).order('end_date', { ascending: true, nullsFirst: false }));
}

// ---------------------------------------------------------------------------
// Personal: reconocimientos médicos, formación y vacaciones
// ---------------------------------------------------------------------------

export async function listMedicalCheckups(workerId) {
  return orThrow(await supabase.from('worker_medical_checkups').select('*').eq('worker_id', workerId).order('checkup_date', { ascending: false }));
}
export async function addMedicalCheckup(fields) {
  return orThrow(await supabase.from('worker_medical_checkups').insert(fields).select().single());
}
export async function updateMedicalCheckup(id, patch) {
  return orThrow(await supabase.from('worker_medical_checkups').update(patch).eq('id', id).select().single());
}
export async function deleteMedicalCheckup(id) {
  const deleted = orThrow(await supabase.from('worker_medical_checkups').delete().eq('id', id).select());
  if (deleted.length === 0) throw new Error('No tienes permiso para borrar esto.');
}

/** El reconocimiento más reciente de cada trabajador (uno por worker_id), para listas y panel. */
export async function listLatestMedicalCheckups() {
  const rows = orThrow(await supabase.from('worker_medical_checkups').select('worker_id, checkup_date, valid_until').order('checkup_date', { ascending: false }));
  const latest = new Map();
  for (const row of rows) if (!latest.has(row.worker_id)) latest.set(row.worker_id, row);
  return latest;
}

export async function listTrainings(workerId) {
  return orThrow(await supabase.from('worker_trainings').select('*').eq('worker_id', workerId).order('training_date', { ascending: false }));
}
export async function addTraining(fields) {
  return orThrow(await supabase.from('worker_trainings').insert(fields).select().single());
}
export async function updateTraining(id, patch) {
  return orThrow(await supabase.from('worker_trainings').update(patch).eq('id', id).select().single());
}
export async function deleteTraining(id) {
  const deleted = orThrow(await supabase.from('worker_trainings').delete().eq('id', id).select());
  if (deleted.length === 0) throw new Error('No tienes permiso para borrar esto.');
}

export async function listTrainingAttachments(trainingId) {
  const files = orThrow(await supabase.from('attachments').select('*').eq('training_id', trainingId).order('created_at'));
  const urls = await signedUrls('attachments', files.map((f) => f.storage_path));
  return files.map((f) => ({ ...f, url: urls[f.storage_path] }));
}
export async function uploadTrainingAttachment(workerId, trainingId, file) {
  const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(-80);
  const path = `${workerId}/${crypto.randomUUID()}-${safeName}`;
  const up = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (up.error) throw up.error;
  const row = await supabase.from('attachments').insert({ training_id: trainingId, storage_path: path, file_name: file.name, mime_type: file.type || null, size_bytes: file.size });
  if (row.error) {
    await supabase.storage.from('attachments').remove([path]);
    throw row.error;
  }
}

export async function listVacations(workerId) {
  return orThrow(await supabase.from('worker_vacations').select('*').eq('worker_id', workerId).order('start_date', { ascending: false }));
}
export async function addVacation(fields) {
  return orThrow(await supabase.from('worker_vacations').insert(fields).select().single());
}
export async function updateVacation(id, patch) {
  return orThrow(await supabase.from('worker_vacations').update(patch).eq('id', id).select().single());
}
export async function deleteVacation(id) {
  const deleted = orThrow(await supabase.from('worker_vacations').delete().eq('id', id).select());
  if (deleted.length === 0) throw new Error('No tienes permiso para borrar esto.');
}

// ---------------------------------------------------------------------------
// Obras
// ---------------------------------------------------------------------------

export async function listProjects() {
  const rows = orThrow(await supabase.from('projects').select('*'));
  return [...rows].sort(byActiveThenName('name'));
}

export async function saveProject(id, fields) {
  const query = id ? supabase.from('projects').update(fields).eq('id', id) : supabase.from('projects').insert(fields);
  return orThrow(await query.select().single());
}

export const setProjectActive = setActiveFactory('projects');
export const deleteProject = deleteFactory('projects');

/** Ficha completa: la obra + su checklist de hitos + proveedores asignados + certificaciones. */
export async function getProject(id) {
  const [project, milestones, providers, certifications] = await Promise.all([
    supabase.from('projects').select('*').eq('id', id).single(),
    supabase.from('project_milestones').select('*').eq('project_id', id),
    supabase.from('project_providers').select('*, provider:providers(id,name,active)').eq('project_id', id),
    supabase.from('project_certifications').select('*').eq('project_id', id).order('cert_date', { ascending: false }),
  ]);
  return {
    project: orThrow(project),
    milestones: orThrow(milestones),
    providers: orThrow(providers),
    certifications: orThrow(certifications),
  };
}

// ---------------------------------------------------------------------------
// Hitos de la obra (checklist fijo, sembrado al crear la obra)
// ---------------------------------------------------------------------------

export async function saveMilestone(id, patch) {
  return orThrow(await supabase.from('project_milestones').update(patch).eq('id', id).select().single());
}

export async function listMilestoneAttachments(milestoneId) {
  const files = orThrow(await supabase.from('attachments').select('*').eq('milestone_id', milestoneId).order('created_at'));
  const urls = await signedUrls('attachments', files.map((f) => f.storage_path));
  return files.map((f) => ({ ...f, url: urls[f.storage_path] }));
}

export async function uploadMilestoneAttachment(projectId, milestoneId, file) {
  const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(-80);
  const path = `${projectId}/${crypto.randomUUID()}-${safeName}`;
  const up = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type || 'application/octet-stream' });
  if (up.error) throw up.error;
  const row = await supabase.from('attachments').insert({
    milestone_id: milestoneId,
    storage_path: path,
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
  });
  if (row.error) {
    await supabase.storage.from('attachments').remove([path]);
    throw row.error;
  }
}

export async function deleteAttachment(id, storagePath) {
  const deleted = orThrow(await supabase.from('attachments').delete().eq('id', id).select());
  if (deleted.length === 0) throw new Error('No tienes permiso para borrar esto.');
  await supabase.storage.from('attachments').remove([storagePath]);
}

// ---------------------------------------------------------------------------
// Proveedores asignados a una obra (con si han mandado su documentación)
// ---------------------------------------------------------------------------

export async function addProjectProvider(projectId, providerId, notes = null) {
  return orThrow(await supabase.from('project_providers').insert({ project_id: projectId, provider_id: providerId, notes }).select('*, provider:providers(id,name,active)').single());
}
export async function updateProjectProvider(id, patch) {
  return orThrow(await supabase.from('project_providers').update(patch).eq('id', id).select('*, provider:providers(id,name,active)').single());
}
export async function removeProjectProvider(id) {
  const deleted = orThrow(await supabase.from('project_providers').delete().eq('id', id).select());
  if (deleted.length === 0) throw new Error('No tienes permiso para quitar esto.');
}

// ---------------------------------------------------------------------------
// Certificaciones
// ---------------------------------------------------------------------------

/** Certificaciones sin cobrar de todas las obras activas, para el panel principal. */
export async function listPendingCertifications() {
  const rows = orThrow(
    await supabase.from('project_certifications').select('*, project:projects(id,name,active)').is('payment_date', null).order('cert_date'),
  );
  return rows.filter((r) => r.project?.active);
}

export async function addCertification(projectId, fields) {
  return orThrow(await supabase.from('project_certifications').insert({ ...fields, project_id: projectId }).select().single());
}
export async function updateCertification(id, patch) {
  return orThrow(await supabase.from('project_certifications').update(patch).eq('id', id).select().single());
}
export async function deleteCertification(id) {
  const deleted = orThrow(await supabase.from('project_certifications').delete().eq('id', id).select());
  if (deleted.length === 0) throw new Error('No tienes permiso para borrar esto.');
}

// ---------------------------------------------------------------------------
// Parte de horas
// ---------------------------------------------------------------------------

/** @param {{projectId?:string, workerId?:string, from?:string, to?:string}} filters */
export async function listWorkHours(filters = {}) {
  let query = supabase
    .from('work_hours')
    .select('*, worker:workers(id,full_name,active), project:projects(id,name,active)')
    .order('work_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (filters.projectId) query = query.eq('project_id', filters.projectId);
  if (filters.workerId) query = query.eq('worker_id', filters.workerId);
  if (filters.from) query = query.gte('work_date', filters.from);
  if (filters.to) query = query.lte('work_date', filters.to);
  return orThrow(await query);
}

export async function addWorkHours(fields) {
  return orThrow(await supabase.from('work_hours').insert(fields).select('*, worker:workers(id,full_name,active), project:projects(id,name,active)').single());
}
export async function updateWorkHours(id, patch) {
  return orThrow(await supabase.from('work_hours').update(patch).eq('id', id).select('*, worker:workers(id,full_name,active), project:projects(id,name,active)').single());
}
export async function deleteWorkHours(id) {
  const deleted = orThrow(await supabase.from('work_hours').delete().eq('id', id).select());
  if (deleted.length === 0) throw new Error('No tienes permiso para borrar esto.');
}

// ---------------------------------------------------------------------------
// Equipo (usuarios de la app)
// ---------------------------------------------------------------------------

export async function listProfiles() {
  return orThrow(await supabase.from('profiles').select(PROFILE_COLUMNS).order('created_at'));
}
export async function updateProfile(id, patch) {
  orThrow(await supabase.from('profiles').update(patch).eq('id', id).select('id').single());
}
