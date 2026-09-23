-- =============================================================================
-- Prakisama Works · Migración 5: finanzas (bancos y sus productos)
--
-- Un banco (baja lógica, como trabajadores/proveedores/subcontratas/obras) tiene varios productos
-- (préstamo, aval, línea de crédito, cuenta...). Cada producto puede tener una fecha de
-- finalización/caducidad, que entra en el mismo semáforo visual que el reconocimiento médico
-- (sin avisos por email, ver `src/lib/dueStatus.js`).
-- =============================================================================

create table public.banks (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  contact_name text,
  phone        text,
  email        text,
  notes        text,
  active       boolean not null default true,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index banks_active_idx on public.banks (active);
create trigger banks_updated_at before update on public.banks
  for each row execute function public.set_updated_at();

create table public.bank_products (
  id         uuid primary key default gen_random_uuid(),
  bank_id    uuid not null references public.banks (id) on delete cascade,
  name       text not null,     -- p. ej. "Préstamo nave industrial", "Aval obra X", "Línea de crédito"
  amount     numeric(14, 2) check (amount is null or amount >= 0),   -- importe o límite, opcional
  end_date   date,              -- vencimiento/caducidad; vacío = sin semáforo
  notes      text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bank_products_bank_idx on public.bank_products (bank_id);
create index bank_products_end_date_idx on public.bank_products (end_date);
create trigger bank_products_updated_at before update on public.bank_products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: banks con baja lógica (como el resto de listas maestras); bank_products es editable y
-- borrable (como las certificaciones de obra), para poder corregir errores o dar por cerrado un
-- producto sin dejar basura.
-- ---------------------------------------------------------------------------

alter table public.banks         enable row level security;
alter table public.bank_products enable row level security;

create policy banks_select on public.banks for select to authenticated using ((select public.is_member()));
create policy banks_insert on public.banks for insert to authenticated with check ((select public.is_member()));
create policy banks_update on public.banks for update to authenticated using ((select public.is_member())) with check ((select public.is_member()));

create policy bank_products_select on public.bank_products for select to authenticated using ((select public.is_member()));
create policy bank_products_insert on public.bank_products for insert to authenticated with check ((select public.is_member()) and created_by = (select auth.uid()));
create policy bank_products_update on public.bank_products for update to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy bank_products_delete on public.bank_products for delete to authenticated using ((select public.is_member()));
