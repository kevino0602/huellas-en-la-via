-- =====================================================================
-- Huellas en la Vía · Fotos (Supabase Storage)
-- Dos buckets PRIVADOS. Las fotos se ven con enlaces firmados que
-- caducan; nadie puede listar ni descargar fotos ajenas.
--   reportes/<usuario_id>/<reporte_id>.jpg     → fotos de los usuarios
--   evidencias/<encargado_id>/<caso_id>-<n>.jpg → prueba al finalizar
-- La app reduce la foto y la vuelve a codificar como JPEG en el
-- celular, lo que borra los metadatos EXIF (GPS de la casa, modelo del
-- celular) antes de subirla.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('reportes',   'reportes',   false, 3145728, array['image/jpeg']),
  ('evidencias', 'evidencias', false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ¿Puede quien llama ver esta foto de reporte? (admin o encargado del caso)
create or replace function public.puede_ver_foto_reporte(p_ruta text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.es_admin()
      or exists (
           select 1 from public.reportes r
           where r.foto_path = p_ruta
             and r.caso_id is not null
             and public.puede_ver_caso(r.caso_id)
         );
$$;

create or replace function public.puede_ver_foto_evidencia(p_ruta text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.es_admin()
      or exists (
           select 1 from public.casos c
           where c.foto_evidencia = p_ruta and public.puede_ver_caso(c.id)
         );
$$;

-- ¿La foto ya está ligada a un reporte revisado? (entonces no se puede borrar)
create or replace function public.foto_reporte_revisada(p_ruta text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.reportes r where r.foto_path = p_ruta and r.estado <> 'en_revision');
$$;

grant execute on function public.puede_ver_foto_reporte(text),
                          public.puede_ver_foto_evidencia(text),
                          public.foto_reporte_revisada(text)
  to authenticated;

-- Fotos de reportes ------------------------------------------------------
create policy "reportes: subir en mi carpeta" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'reportes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.puede_reportar()
  );

create policy "reportes: ver" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'reportes'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.puede_ver_foto_reporte(name))
  );

create policy "reportes: borrar la mía si no fue revisada" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'reportes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.foto_reporte_revisada(name)
  );

-- Fotos de evidencia -----------------------------------------------------
create policy "evidencias: subir en mi carpeta" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidencias'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.es_encargado()
  );

create policy "evidencias: ver" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidencias'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.puede_ver_foto_evidencia(name))
  );
