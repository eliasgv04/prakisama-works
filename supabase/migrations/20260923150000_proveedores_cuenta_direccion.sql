-- =============================================================================
-- Prakisama Works · Migración 7: número de cuenta y dirección en proveedores/subcontratas
--
-- Hace falta el número de cuenta para pagos. Se quita "persona de contacto": no se usa y venía
-- de la importación del Excel sin esa columna.
-- =============================================================================

alter table public.providers
  add column account_number text,
  add column address text,
  drop column contact_name;

alter table public.subcontractors
  add column account_number text,
  add column address text,
  drop column contact_name;
