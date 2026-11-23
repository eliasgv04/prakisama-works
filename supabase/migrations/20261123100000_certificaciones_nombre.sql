-- =============================================================================
-- Prakisama Works · Migración 17: nombre de las certificaciones
--
-- Petición del usuario: en la ficha de la obra cada certificación solo enseñaba el importe y no se
-- sabía cuál era cuál. Ahora llevan un nombre (p. ej. "Certificación nº 3 – octubre").
-- La app lo pide como obligatorio al crear o editar; en la base de datos se deja opcional para no
-- inventar nombres a las que ya existían: sin nombre, la app enseña "Certificación del dd/mm/aaaa".
-- =============================================================================

alter table public.project_certifications add column name text;
