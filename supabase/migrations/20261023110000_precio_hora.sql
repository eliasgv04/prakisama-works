-- =============================================================================
-- Prakisama Works · Migración 16: precio por hora de los trabajadores
--
-- Petición del usuario: poner en el parte de horas el precio por hora de cada trabajador, que
-- calcule el total (horas × precio) y que ese coste salga como un apartado más ("Trabajadores")
-- en los gastos de la obra.
--   - workers.hourly_rate: el precio habitual del trabajador; la pantalla de horas lo propone.
--   - work_hours.hourly_rate: el precio de ESE registro (copia del habitual, editable). Se guarda
--     en cada registro para que subir el precio de un trabajador no cambie lo ya apuntado.
--   - work_hours.total_cost: columna generada (como total_amount de la obra), nunca a mano.
-- Opcional en los dos sitios: los registros antiguos se quedan sin precio (coste "sin precio").
-- =============================================================================

alter table public.workers
  add column hourly_rate numeric(10, 2) check (hourly_rate is null or hourly_rate >= 0);

alter table public.work_hours
  add column hourly_rate numeric(10, 2) check (hourly_rate is null or hourly_rate >= 0),
  add column total_cost  numeric(12, 2) generated always as (round(hours * hourly_rate, 2)) stored;
