-- =============================================================================
-- Prakisama Works · Migración 18: tipos de producto bancario (aval, préstamo, leasing, otro)
--
-- Petición del usuario: al añadir un producto se elige primero el tipo, y cada tipo pide sus datos.
--   - Aval: puede ir ligado a una obra de la app (project_id, como hasta ahora) o a una obra que NO
--     está en la app (external_project, texto libre): p. ej. una obra ya terminada cuyo aval sigue
--     vigente, que no tiene sentido dar de alta entera. La fecha de fin del aval (end_date) es la
--     que avisa en el panel.
--   - Préstamo y leasing: fecha de constitución (start_date), importe financiado (amount, la columna
--     que ya había), plazo en meses (term_months), tipo de interés nominal anual (interest_rate, %),
--     cuota mensual (monthly_payment) y, en el leasing, valor residual / opción de compra
--     (residual_value). La app calcula la cuota si no se escribe, y con eso el total, los intereses,
--     lo pagado y lo pendiente (src/lib/loans.js). end_date = constitución + plazo (trigger).
--   - Otro: líneas de crédito, pólizas… lo de siempre (nombre, importe, fecha de fin a mano).
--
-- Los 8 productos que había al aplicar esta migración eran todos avales (nombre "AVAL …" y/o
-- recepción + duración): se marcan como 'aval'. Lo que no encaje queda como 'otro'.
-- =============================================================================

alter table public.bank_products
  add column kind             text not null default 'otro' check (kind in ('aval', 'prestamo', 'leasing', 'otro')),
  add column external_project text,
  add column start_date       date,
  add column term_months      integer check (term_months is null or term_months > 0),
  add column interest_rate    numeric(6, 3) check (interest_rate is null or interest_rate >= 0),
  add column monthly_payment  numeric(14, 2) check (monthly_payment is null or monthly_payment >= 0),
  add column residual_value   numeric(14, 2) check (residual_value is null or residual_value >= 0),
  -- Un aval es de una obra de la app O de una obra escrita a mano, no de las dos.
  add constraint bank_products_one_project check (project_id is null or external_project is null);

update public.bank_products
   set kind = case
     when project_id is not null or reception_date is not null or guarantee_months is not null or name ilike '%aval%' then 'aval'
     when name ilike '%leasing%' then 'leasing'
     when name ilike '%préstamo%' or name ilike '%prestamo%' then 'prestamo'
     else 'otro'
   end;

create index bank_products_kind_idx on public.bank_products (kind);

-- La fecha de fin se calcula sola: aval con recepción + duración (como en la migración 12) y
-- préstamo/leasing con constitución + plazo. Sin esos datos se respeta la que venga a mano.
create or replace function public.bank_products_compute_end_date()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.kind in ('prestamo', 'leasing') then
    if new.start_date is not null and new.term_months is not null then
      new.end_date := (new.start_date + make_interval(months => new.term_months))::date;
    end if;
  elsif new.reception_date is not null and new.guarantee_months is not null then
    new.end_date := (new.reception_date + make_interval(months => new.guarantee_months))::date;
  end if;
  return new;
end;
$$;
