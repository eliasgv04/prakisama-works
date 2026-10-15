-- =============================================================================
-- Prakisama Works · Migración 12: aval con recepción + duración, y prórroga de la obra
--
-- Petición del usuario:
--   - Aval: en vez de escribir a mano el "fin del periodo de garantía", se pone la fecha de
--     recepción de la obra (la garantía empieza a contar ahí) y la duración del aval (meses o
--     años); la fecha de fin se calcula sola. Se guarda en meses (guarantee_months; los años se
--     convierten a meses en la app). end_date sigue siendo la columna del semáforo: un trigger la
--     rellena cuando hay recepción y duración, así nunca puede descuadrar. Sin esos dos datos,
--     end_date se queda como estaba (los productos que no son aval la siguen poniendo a mano).
--   - Obra: prórroga opcional (cantidad + unidad: días, meses o años) sobre la finalización
--     original. La finalización prorrogada es una columna generada, como total_amount.
-- =============================================================================

alter table public.bank_products
  add column reception_date   date,
  add column guarantee_months integer check (guarantee_months is null or guarantee_months > 0);

create or replace function public.bank_products_compute_end_date()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.reception_date is not null and new.guarantee_months is not null then
    new.end_date := (new.reception_date + make_interval(months => new.guarantee_months))::date;
  end if;
  return new;
end;
$$;

create trigger bank_products_end_date before insert or update on public.bank_products
  for each row execute function public.bank_products_compute_end_date();

alter table public.projects
  add column extension_amount integer check (extension_amount is null or extension_amount > 0),
  add column extension_unit   text check (extension_unit is null or extension_unit in ('day', 'month', 'year')),
  add constraint projects_extension_complete check ((extension_amount is null) = (extension_unit is null)),
  add constraint projects_extension_needs_end check (extension_amount is null or end_date is not null);

alter table public.projects
  add column extended_end_date date generated always as (
    case when end_date is null or extension_amount is null then null
         else (end_date + case extension_unit
                            when 'day'   then make_interval(days => extension_amount)
                            when 'month' then make_interval(months => extension_amount)
                            else make_interval(years => extension_amount)
                          end)::date
    end
  ) stored;
