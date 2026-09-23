-- =============================================================================
-- Prakisama Works · Migración 2: Row Level Security
--
-- Principios (igual que en Mobility):
--  1. RLS activado en TODAS las tablas. Sin política = denegado por defecto.
--  2. Solo el rol `authenticated` recibe políticas; `anon` (sin sesión) no puede nada.
--  3. Sin roles: cualquier usuario con la cuenta ACTIVA (is_member()) puede hacer lo mismo.
--  4. Baja lógica en trabajadores, proveedores, subcontratas y obras: nadie puede borrarlos
--     (solo active=false), porque hay horas, certificaciones y asignaciones que dependen de ellos.
--     El resto de tablas sí admite borrar, para poder corregir errores.
--  5. `(select public.is_member())` y no `public.is_member()` a secas: Postgres evalúa la función
--     una vez por consulta y no una vez por fila (recomendación de rendimiento de Supabase).
-- =============================================================================

alter table public.profiles                enable row level security;
alter table public.workers                  enable row level security;
alter table public.providers                enable row level security;
alter table public.subcontractors           enable row level security;
alter table public.projects                 enable row level security;
alter table public.project_milestones       enable row level security;
alter table public.project_providers        enable row level security;
alter table public.project_subcontractors   enable row level security;
alter table public.project_certifications   enable row level security;
alter table public.work_hours               enable row level security;
alter table public.attachments              enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: cada quien ve y edita su fila, o cualquier miembro ve/edita cualquiera (sin roles no
-- tiene sentido ocultarse datos entre compañeros). Insertar: nadie (lo hace handle_new_user).
-- Borrar: nadie (se desactiva). El trigger profiles_guard protege la última cuenta activa.
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using ((select public.is_member()));

create policy profiles_update on public.profiles for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));

-- ---------------------------------------------------------------------------
-- workers / providers / subcontractors: mismas políticas en los tres (ver, crear, editar
-- cualquier miembro; borrar nadie, baja lógica).
-- ---------------------------------------------------------------------------
create policy workers_select on public.workers for select to authenticated using ((select public.is_member()));
create policy workers_insert on public.workers for insert to authenticated with check ((select public.is_member()));
create policy workers_update on public.workers for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));

create policy providers_select on public.providers for select to authenticated using ((select public.is_member()));
create policy providers_insert on public.providers for insert to authenticated with check ((select public.is_member()));
create policy providers_update on public.providers for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));

create policy subcontractors_select on public.subcontractors for select to authenticated using ((select public.is_member()));
create policy subcontractors_insert on public.subcontractors for insert to authenticated with check ((select public.is_member()));
create policy subcontractors_update on public.subcontractors for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));

-- ---------------------------------------------------------------------------
-- projects: igual, baja lógica (nadie borra, solo active=false).
-- ---------------------------------------------------------------------------
create policy projects_select on public.projects for select to authenticated using ((select public.is_member()));
create policy projects_insert on public.projects for insert to authenticated with check ((select public.is_member()));
create policy projects_update on public.projects for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));

-- ---------------------------------------------------------------------------
-- project_milestones: las 9 filas las siembra el trigger; aquí solo se editan (fecha/notas).
-- Sin insert ni delete para la app: nunca hace falta añadir o quitar un tipo de hito a mano.
-- ---------------------------------------------------------------------------
create policy project_milestones_select on public.project_milestones for select to authenticated
  using ((select public.is_member()));
create policy project_milestones_update on public.project_milestones for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));

-- ---------------------------------------------------------------------------
-- project_providers / project_subcontractors: asignar y quitar (no es baja lógica: es una
-- relación entre obra y proveedor, no un dato histórico).
-- ---------------------------------------------------------------------------
create policy project_providers_select on public.project_providers for select to authenticated
  using ((select public.is_member()));
create policy project_providers_insert on public.project_providers for insert to authenticated
  with check ((select public.is_member()));
create policy project_providers_update on public.project_providers for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
create policy project_providers_delete on public.project_providers for delete to authenticated
  using ((select public.is_member()));

create policy project_subcontractors_select on public.project_subcontractors for select to authenticated
  using ((select public.is_member()));
create policy project_subcontractors_insert on public.project_subcontractors for insert to authenticated
  with check ((select public.is_member()));
create policy project_subcontractors_update on public.project_subcontractors for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
create policy project_subcontractors_delete on public.project_subcontractors for delete to authenticated
  using ((select public.is_member()));

-- ---------------------------------------------------------------------------
-- project_certifications: historial, se puede corregir o borrar para arreglar errores.
-- ---------------------------------------------------------------------------
create policy project_certifications_select on public.project_certifications for select to authenticated
  using ((select public.is_member()));
create policy project_certifications_insert on public.project_certifications for insert to authenticated
  with check ((select public.is_member()) and created_by = (select auth.uid()));
create policy project_certifications_update on public.project_certifications for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
create policy project_certifications_delete on public.project_certifications for delete to authenticated
  using ((select public.is_member()));

-- ---------------------------------------------------------------------------
-- work_hours: parte de horas, igual que las certificaciones (historial editable/borrable).
-- ---------------------------------------------------------------------------
create policy work_hours_select on public.work_hours for select to authenticated
  using ((select public.is_member()));
create policy work_hours_insert on public.work_hours for insert to authenticated
  with check ((select public.is_member()) and created_by = (select auth.uid()));
create policy work_hours_update on public.work_hours for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
create policy work_hours_delete on public.work_hours for delete to authenticated
  using ((select public.is_member()));

-- ---------------------------------------------------------------------------
-- attachments: ver, subir y borrar cualquier miembro (adjunta quien esté marcando el hito).
-- ---------------------------------------------------------------------------
create policy attachments_select on public.attachments for select to authenticated
  using ((select public.is_member()));
create policy attachments_insert on public.attachments for insert to authenticated
  with check ((select public.is_member()) and created_by = (select auth.uid()));
create policy attachments_delete on public.attachments for delete to authenticated
  using ((select public.is_member()));
