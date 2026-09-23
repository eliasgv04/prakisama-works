-- =============================================================================
-- Prakisama Works · Migración 8: se quita el número de cuenta de proveedores/subcontratas
--
-- Se añadió en la migración 7 pensando que el Excel de importación lo traía; no es así (ese dato
-- no existe en ningún sitio todavía). Se quita para no dejar un campo siempre vacío; se puede
-- volver a añadir cuando haya una fuente real de donde sacarlo.
-- =============================================================================

alter table public.providers drop column account_number;
alter table public.subcontractors drop column account_number;
