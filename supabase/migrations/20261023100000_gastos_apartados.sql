-- =============================================================================
-- Prakisama Works · Migración 15: apartados en los gastos de la obra
--
-- Petición del usuario: separar los gastos en tres apartados, cada uno con su total:
--   - proveedor:   lo que había (proveedor + título + importe + fecha + nº factura + descripción).
--   - subcontrata: mismos datos que proveedor. Desde la migración 10 no hay tabla de subcontratas,
--                  así que la subcontrata se elige de la misma lista de proveedores.
--   - gasoil:      kms ida y vuelta, día y precio (por km); el importe es kms × precio.
-- El importe del gasoil lo calcula un trigger (como end_date del aval, migración 12): nunca se
-- escribe a mano, así no puede descuadrar. Para proveedor/subcontrata sigue siendo a mano.
-- Los gastos ya apuntados pasan a "proveedor" (era el único tipo que existía).
-- =============================================================================

alter table public.project_expenses
  add column category  text not null default 'proveedor' check (category in ('proveedor', 'subcontrata', 'gasoil')),
  add column km        numeric(10, 2) check (km is null or km >= 0),
  add column km_price  numeric(10, 4) check (km_price is null or km_price >= 0);

-- El gasoil no lleva proveedor ni título; los otros dos apartados siguen exigiéndolos.
alter table public.project_expenses alter column provider_id drop not null;
alter table public.project_expenses alter column title drop not null;
alter table public.project_expenses add constraint project_expenses_category_fields check (
  case category
    when 'gasoil' then km is not null and km_price is not null
    else provider_id is not null and title is not null
  end
);

create or replace function public.project_expenses_compute_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category = 'gasoil' then
    new.amount := round(new.km * new.km_price, 2);
  end if;
  return new;
end;
$$;

create trigger project_expenses_compute_amount
  before insert or update on public.project_expenses
  for each row execute function public.project_expenses_compute_amount();

create index project_expenses_category_idx on public.project_expenses (project_id, category);
