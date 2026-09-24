-- =============================================================================
-- Prakisama Works · Migración 11: número de cuenta y nº de afiliación S.S. en trabajadores
--
-- Para la importación del listado real de trabajadores (nómina/pagos y Seguridad Social).
-- =============================================================================

alter table public.workers
  add column account_number text,
  add column social_security_number text;
