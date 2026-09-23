-- =============================================================================
-- Prakisama Works · Migración 9: borrar de verdad, además de dar de baja
--
-- Hasta ahora trabajadores, proveedores, subcontratas, bancos y obras solo se podían dar de baja
-- (active=false), nunca borrar — iba bien para no perder historial, pero el usuario quiere poder
-- limpiar del todo entradas que sobran (p. ej. de una importación). Se añade DELETE a las cinco.
--
-- Las claves foráneas ya protegen lo importante sin tocarlas:
--   - Un trabajador/obra con horas registradas (work_hours) NO se puede borrar (ON DELETE RESTRICT):
--     hay que darlo de baja en vez de borrarlo.
--   - Un proveedor/subcontrata asignado a alguna obra tampoco se puede borrar hasta quitarlo de ahí.
--   - Borrar un trabajador sin horas borra también su reconocimiento médico/formación/vacaciones
--     (ON DELETE CASCADE). Borrar una obra sin horas borra sus hitos/certificaciones/asignaciones,
--     pero un aval vinculado a ella NO se borra: se queda en el banco sin obra asociada.
--   - Borrar un banco SÍ borra en cascada todos sus productos (avales incluidos).
-- =============================================================================

create policy workers_delete on public.workers for delete to authenticated using ((select public.is_member()));
create policy providers_delete on public.providers for delete to authenticated using ((select public.is_member()));
create policy subcontractors_delete on public.subcontractors for delete to authenticated using ((select public.is_member()));
create policy banks_delete on public.banks for delete to authenticated using ((select public.is_member()));
create policy projects_delete on public.projects for delete to authenticated using ((select public.is_member()));
