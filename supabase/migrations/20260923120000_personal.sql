-- =============================================================================
-- Prakisama Works · Migración 4: reconocimientos médicos, formación y vacaciones del personal
--
-- Reconocimiento médico: SÍ tiene semáforo (ok/próximo/vencido), calculado en el cliente a partir
-- del último reconocimiento registrado de cada trabajador — pero sin motor de avisos por email
-- (decisión explícita: de momento solo visual en el panel, como el resto de esta app; el día que
-- haga falta email es la misma arquitectura que ITV en Mobility: Edge Function + pg_cron + Resend).
-- Formación: historial simple con certificado adjunto, sin caducidad ni avisos.
-- Vacaciones: periodos con fecha de inicio y fin, sin cálculo de saldo de días.
-- =============================================================================

create table public.worker_medical_checkups (
  id           uuid primary key default gen_random_uuid(),
  worker_id    uuid not null references public.workers (id) on delete cascade,
  checkup_date date not null,
  valid_until  date,    -- vencimiento; null = sin vencimiento conocido (no entra en el semáforo)
  notes        text,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  check (valid_until is null or valid_until >= checkup_date)
);
create index worker_medical_checkups_worker_idx on public.worker_medical_checkups (worker_id, checkup_date desc);

create table public.worker_trainings (
  id            uuid primary key default gen_random_uuid(),
  worker_id     uuid not null references public.workers (id) on delete cascade,
  training_date date not null,
  name          text not null,
  notes         text,
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index worker_trainings_worker_idx on public.worker_trainings (worker_id, training_date desc);

create table public.worker_vacations (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references public.workers (id) on delete cascade,
  start_date date not null,
  end_date   date not null,
  notes      text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index worker_vacations_worker_idx on public.worker_vacations (worker_id, start_date desc);

-- Adjuntos: el certificado de una formación cuelga de la misma tabla que los adjuntos de hitos.
alter table public.attachments add column training_id uuid references public.worker_trainings (id) on delete cascade;
alter table public.attachments drop constraint attachments_milestone_id_check;
alter table public.attachments add constraint attachments_check
  check ((milestone_id is not null)::int + (training_id is not null)::int = 1);
create index attachments_training_idx on public.attachments (training_id);

-- ---------------------------------------------------------------------------
-- RLS: mismo criterio que el resto de historial editable (certificaciones, parte de horas):
-- cualquier miembro ve, crea, edita y borra, para poder corregir errores.
-- ---------------------------------------------------------------------------

alter table public.worker_medical_checkups enable row level security;
alter table public.worker_trainings         enable row level security;
alter table public.worker_vacations         enable row level security;

create policy worker_medical_checkups_select on public.worker_medical_checkups for select to authenticated using ((select public.is_member()));
create policy worker_medical_checkups_insert on public.worker_medical_checkups for insert to authenticated with check ((select public.is_member()) and created_by = (select auth.uid()));
create policy worker_medical_checkups_update on public.worker_medical_checkups for update to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy worker_medical_checkups_delete on public.worker_medical_checkups for delete to authenticated using ((select public.is_member()));

create policy worker_trainings_select on public.worker_trainings for select to authenticated using ((select public.is_member()));
create policy worker_trainings_insert on public.worker_trainings for insert to authenticated with check ((select public.is_member()) and created_by = (select auth.uid()));
create policy worker_trainings_update on public.worker_trainings for update to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy worker_trainings_delete on public.worker_trainings for delete to authenticated using ((select public.is_member()));

create policy worker_vacations_select on public.worker_vacations for select to authenticated using ((select public.is_member()));
create policy worker_vacations_insert on public.worker_vacations for insert to authenticated with check ((select public.is_member()) and created_by = (select auth.uid()));
create policy worker_vacations_update on public.worker_vacations for update to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy worker_vacations_delete on public.worker_vacations for delete to authenticated using ((select public.is_member()));
