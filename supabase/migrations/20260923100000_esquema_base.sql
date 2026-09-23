-- =============================================================================
-- Prakisama Works · Migración 1: esquema base
-- Tablas, índices y triggers. Las políticas RLS van en la migración 2; Storage, en la 3.
--
-- Sin roles desde el principio (igual que Prakisama Mobility tras su migración 7): todo usuario
-- con la cuenta activa puede hacer lo mismo. Sin motor de avisos por email: nada de lo que pide
-- esta app tiene plazos ni recordatorios, así que no hay Edge Functions, pg_cron ni Resend.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: una fila por usuario de Auth. Sin rol ni token: aquí no hay calendario ni avisos.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- SECURITY DEFINER para poder leer profiles desde las políticas RLS sin recursión;
-- search_path vacío por seguridad (todo va cualificado).
create or replace function public.is_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active);
$$;

-- Al crearse un usuario en Auth se crea su perfil (alta solo por invitación: sin registro público).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nadie puede quedarse fuera por error: no se puede desactivar la propia cuenta ni dejar el
-- sistema sin ningún usuario activo. (service_role, con auth.uid() nulo, no se restringe.)
create or replace function public.profiles_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.active and not new.active then
    if old.id = auth.uid() then
      raise exception 'No puedes desactivar tu propia cuenta';
    end if;
    if not exists (select 1 from public.profiles p where p.id <> old.id and p.active) then
      raise exception 'Debe quedar al menos un usuario activo';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------------
-- workers: listado de trabajadores (baja lógica, como en Mobility: nunca se borran)
-- ---------------------------------------------------------------------------

create table public.workers (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  nif        text,
  phone      text,
  role       text,     -- categoría/oficio, texto libre (oficial, peón, encargado...)
  notes      text,
  active     boolean not null default true,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workers_active_idx on public.workers (active);
create trigger workers_updated_at before update on public.workers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- providers: proveedores (baja lógica)
-- ---------------------------------------------------------------------------

create table public.providers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  nif          text,
  contact_name text,
  phone        text,
  email        text,
  notes        text,
  active       boolean not null default true,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index providers_active_idx on public.providers (active);
create trigger providers_updated_at before update on public.providers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- subcontractors: subcontratas (baja lógica). Misma forma que providers, tabla aparte porque
-- dentro de cada obra se controla además si han mandado su documentación.
-- ---------------------------------------------------------------------------

create table public.subcontractors (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  nif          text,
  contact_name text,
  phone        text,
  email        text,
  notes        text,
  active       boolean not null default true,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index subcontractors_active_idx on public.subcontractors (active);
create trigger subcontractors_updated_at before update on public.subcontractors
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- projects (obras): baja lógica. El importe total se calcula solo a partir de la base imponible
-- y el % de IVA (columna generada: nunca se guarda un total que no cuadre con esos dos valores).
-- ---------------------------------------------------------------------------

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  reference    text,     -- referencia interna de la obra
  start_date   date,
  end_date     date,
  tax_base     numeric(12, 2) check (tax_base is null or tax_base >= 0),   -- base imponible
  vat_rate     numeric(5, 2)  check (vat_rate is null or vat_rate >= 0),   -- % IVA (21, 10, 4...)
  total_amount numeric(14, 2) generated always as (
    case when tax_base is null then null
         else round(tax_base * (1 + coalesce(vat_rate, 0) / 100.0), 2)
    end
  ) stored,
  notes        text,
  active       boolean not null default true,  -- baja lógica: archivar una obra, nunca borrarla
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index projects_active_idx on public.projects (active);
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- project_milestones: checklist fijo de documentación/hitos de la obra. Sin plazos ni avisos:
-- solo la fecha en que se hizo cada uno (vacía = pendiente) y un adjunto opcional.
-- Se siembran las 9 filas automáticamente al crear la obra, así el checklist es siempre completo.
-- ---------------------------------------------------------------------------

create table public.project_milestones (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind       text not null check (kind in (
    'contrato', 'plan_seguridad', 'acta_aprobacion_ps', 'comunicacion_apertura',
    'libro_subcontratacion', 'constitucion_aval', 'finalizacion_aval', 'acta_replanteo', 'recepcion_obra'
  )),
  done_date  date,    -- null = pendiente
  notes      text,
  unique (project_id, kind)
);
create index project_milestones_project_idx on public.project_milestones (project_id);

create or replace function public.seed_project_milestones()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.project_milestones (project_id, kind)
  select new.id, k
    from unnest(array[
      'contrato', 'plan_seguridad', 'acta_aprobacion_ps', 'comunicacion_apertura',
      'libro_subcontratacion', 'constitucion_aval', 'finalizacion_aval', 'acta_replanteo', 'recepcion_obra'
    ]) as k;
  return new;
end;
$$;
create trigger projects_seed_milestones after insert on public.projects
  for each row execute function public.seed_project_milestones();

-- ---------------------------------------------------------------------------
-- project_providers: proveedores que trabajan en cada obra (asignación simple).
-- ---------------------------------------------------------------------------

create table public.project_providers (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete restrict,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (project_id, provider_id)
);
create index project_providers_project_idx on public.project_providers (project_id);
create index project_providers_provider_idx on public.project_providers (provider_id);

-- ---------------------------------------------------------------------------
-- project_subcontractors: subcontratas de cada obra, con si han mandado su documentación.
-- ---------------------------------------------------------------------------

create table public.project_subcontractors (
  id                       uuid primary key default gen_random_uuid(),
  project_id               uuid not null references public.projects (id) on delete cascade,
  subcontractor_id         uuid not null references public.subcontractors (id) on delete restrict,
  documentation_received   boolean not null default false,
  documentation_received_on date,
  notes                    text,
  created_at               timestamptz not null default now(),
  unique (project_id, subcontractor_id)
);
create index project_subcontractors_project_idx on public.project_subcontractors (project_id);
create index project_subcontractors_subcontractor_idx on public.project_subcontractors (subcontractor_id);

-- ---------------------------------------------------------------------------
-- project_certifications: certificaciones de obra, con su fecha de pago (null = pendiente de cobro).
-- ---------------------------------------------------------------------------

create table public.project_certifications (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  cert_date    date not null,
  amount       numeric(12, 2) not null check (amount >= 0),
  payment_date date,    -- null = pendiente de cobro
  notes        text,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  check (payment_date is null or payment_date >= cert_date)
);
create index project_certifications_project_idx on public.project_certifications (project_id, cert_date desc);

-- ---------------------------------------------------------------------------
-- work_hours: parte de horas. Asigna las horas de un trabajador a una obra en un día concreto,
-- eligiendo de las listas ya creadas (así nunca hay que volver a escribir nombres).
-- ---------------------------------------------------------------------------

create table public.work_hours (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references public.workers (id) on delete restrict,
  project_id uuid not null references public.projects (id) on delete restrict,
  work_date  date not null,
  hours      numeric(4, 2) not null check (hours > 0 and hours <= 24),
  notes      text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (worker_id, project_id, work_date)
);
create index work_hours_date_idx on public.work_hours (work_date desc);
create index work_hours_worker_idx on public.work_hours (worker_id, work_date desc);
create index work_hours_project_idx on public.work_hours (project_id, work_date desc);

-- ---------------------------------------------------------------------------
-- attachments: adjuntos de un hito de obra (contrato firmado, PDF del plan de seguridad...).
-- El fichero vive en el bucket privado "attachments". Solo cuelgan de hitos por ahora: es el único
-- sitio de la app que pidió adjuntos; añadir otro tipo es una columna nullable más y el check.
-- ---------------------------------------------------------------------------

create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  milestone_id  uuid references public.project_milestones (id) on delete cascade,
  storage_path  text not null,
  file_name     text,
  mime_type     text,
  size_bytes    integer,
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (milestone_id is not null)
);
create index attachments_milestone_idx on public.attachments (milestone_id);

-- ---------------------------------------------------------------------------
-- Usuarios que ya existieran en Auth antes de esta migración (p. ej. el primero, creado a mano).
-- Idempotente.
-- ---------------------------------------------------------------------------
insert into public.profiles (id, email, full_name)
select u.id, coalesce(u.email, ''), u.raw_user_meta_data ->> 'full_name'
  from auth.users u
on conflict (id) do nothing;
