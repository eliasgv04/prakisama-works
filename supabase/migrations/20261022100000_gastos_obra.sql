-- =============================================================================
-- Prakisama Works · Migración 13: gastos de la obra
--
-- Petición del usuario: poder apuntar en cada obra los gastos de proveedores, con importe,
-- título, descripción y el proveedor (buscándolo entre los 467 de la lista). Se añade además la
-- fecha del gasto (por defecto hoy) para poder ordenarlos.
-- El proveedor no tiene por qué estar "asignado" a la obra (project_providers): son dos cosas
-- distintas, un gasto suelto de un proveedor cualquiera no obliga a controlar su documentación.
-- provider_id con ON DELETE RESTRICT, como work_hours/project_providers: un proveedor con gastos
-- apuntados es historial real y no se puede eliminar, solo dar de baja.
-- =============================================================================

create table public.project_expenses (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  provider_id  uuid not null references public.providers (id) on delete restrict,
  expense_date date not null default current_date,
  title        text not null check (length(trim(title)) > 0),
  description  text,
  amount       numeric(12, 2) not null check (amount >= 0),
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index project_expenses_project_idx on public.project_expenses (project_id, expense_date desc);
create index project_expenses_provider_idx on public.project_expenses (provider_id);

-- RLS: mismo criterio que certificaciones (historial editable/borrable para corregir errores).
alter table public.project_expenses enable row level security;

create policy project_expenses_select on public.project_expenses for select to authenticated
  using ((select public.is_member()));
create policy project_expenses_insert on public.project_expenses for insert to authenticated
  with check ((select public.is_member()) and created_by = (select auth.uid()));
create policy project_expenses_update on public.project_expenses for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
create policy project_expenses_delete on public.project_expenses for delete to authenticated
  using ((select public.is_member()));
