-- =============================================================================
-- Prakisama Works · Migración 10: subcontratas desaparecen, todo es "proveedores"
--
-- El usuario esperaba poder separar proveedores de subcontratas a mano, pero con 467 importados
-- de golpe no es viable. Todo pasa a ser "proveedores". El control de "quién ha mandado la
-- documentación" que tenían las subcontratas por obra no se pierde: se traslada a
-- project_providers, así que sigue disponible para cualquier proveedor asignado a una obra.
-- =============================================================================

alter table public.project_providers
  add column documentation_received    boolean not null default false,
  add column documentation_received_on date;

drop table public.project_subcontractors;
drop table public.subcontractors;
