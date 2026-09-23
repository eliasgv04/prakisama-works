-- =============================================================================
-- Prakisama Works · Migración 6: el aval pasa a ser un producto bancario de la obra
--
-- El usuario pidió que el aval (constitución, periodo de garantía, solicitud de devolución) se
-- lleve desde Finanzas, no como una fecha suelta del checklist: se vincula un producto bancario a
-- la obra que garantiza, y desde la obra se ve/crea igual. Con esto:
--   - bank_products gana un enlace opcional a la obra (project_id) y la fecha de solicitud de
--     devolución (return_requested_date). El "periodo de garantía" es la fecha de fin que ya
--     tenía (end_date): para un aval, esa fecha es cuándo termina la garantía.
--   - Los hitos "constitución de aval" y "finalización de aval" desaparecen del checklist fijo
--     (quedan sustituidos por el producto bancario vinculado); el resto de hitos no cambia.
-- =============================================================================

alter table public.bank_products
  add column project_id uuid references public.projects (id) on delete set null,
  add column return_requested_date date;
create index bank_products_project_idx on public.bank_products (project_id);

-- Quita los dos hitos de aval de las obras existentes y del tipo permitido.
delete from public.project_milestones where kind in ('constitucion_aval', 'finalizacion_aval');
alter table public.project_milestones drop constraint project_milestones_kind_check;
alter table public.project_milestones add constraint project_milestones_kind_check
  check (kind in ('contrato', 'plan_seguridad', 'acta_aprobacion_ps', 'comunicacion_apertura', 'libro_subcontratacion', 'acta_replanteo', 'recepcion_obra'));

-- El trigger de siembra deja de sembrar esos dos hitos en las obras nuevas.
create or replace function public.seed_project_milestones()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.project_milestones (project_id, kind)
  select new.id, k
    from unnest(array[
      'contrato', 'plan_seguridad', 'acta_aprobacion_ps', 'comunicacion_apertura',
      'libro_subcontratacion', 'acta_replanteo', 'recepcion_obra'
    ]) as k;
  return new;
end;
$$;
