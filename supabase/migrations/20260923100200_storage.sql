-- =============================================================================
-- Prakisama Works · Migración 3: Storage (bucket privado + políticas)
--
-- Un único bucket PRIVADO: nadie accede por URL pública, la app pide URLs firmadas temporales.
--   attachments   adjuntos de los hitos de obra (contrato, plan de seguridad, actas... en PDF o foto)
-- Convención de rutas: <project_id>/<archivo>.
-- RLS de storage.objects ya viene activado por Supabase; aquí solo se definen las políticas.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('attachments', 'attachments', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy attachments_files_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (select public.is_member()));

create policy attachments_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (select public.is_member()));

create policy attachments_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (select public.is_member()));
