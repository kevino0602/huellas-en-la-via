-- =====================================================================
-- Huellas en la Vía · Seguridad
-- Row Level Security (RLS) en todas las tablas y permisos mínimos.
-- Regla general: el navegador puede LEER lo que le corresponde según
-- su rol, pero casi nunca ESCRIBIR directamente. Las escrituras pasan
-- por las funciones de 20261028170200_funciones.sql.
-- =====================================================================

alter table public.configuracion    enable row level security;
alter table public.provincias       enable row level security;
alter table public.cantones         enable row level security;
alter table public.perfiles         enable row level security;
alter table public.encargado_zonas  enable row level security;
alter table public.casos            enable row level security;
alter table public.reportes         enable row level security;
alter table public.caso_historial   enable row level security;
alter table public.caso_exclusiones enable row level security;

-- ---------------------------------------------------------------------
-- Permisos de tabla (defensa en profundidad: aunque una política
-- quedara mal escrita, estas columnas siguen sin poder cambiarse)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on public.provincias, public.cantones to anon, authenticated;
grant select on public.configuracion to authenticated;

grant select on public.perfiles to authenticated;
-- El usuario solo puede editar sus datos de contacto y aceptar la política
grant update (nombre, telefono, canton_id, acepto_privacidad_en) on public.perfiles to authenticated;

grant select, insert, delete on public.reportes to authenticated;
grant select on public.casos, public.caso_historial, public.encargado_zonas, public.caso_exclusiones to authenticated;

-- ---------------------------------------------------------------------
-- Políticas
-- ---------------------------------------------------------------------

-- Territorio y configuración: lectura pública / autenticada
create policy "territorio visible" on public.provincias for select using (true);
create policy "cantones visibles"  on public.cantones   for select using (true);
create policy "configuración visible" on public.configuracion for select to authenticated using (true);

-- Perfiles: cada quien ve el suyo; el administrador ve todos
create policy "ver mi perfil" on public.perfiles
  for select to authenticated
  using (id = auth.uid() or public.es_admin());

create policy "editar mi perfil" on public.perfiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Zonas de encargados
create policy "ver zonas" on public.encargado_zonas
  for select to authenticated
  using (encargado_id = auth.uid() or public.es_admin());

-- Reportes
create policy "ver reportes" on public.reportes
  for select to authenticated
  using (
    usuario_id = auth.uid()
    or public.es_admin()
    or (caso_id is not null and public.puede_ver_caso(caso_id))
  );

create policy "crear mi reporte" on public.reportes
  for insert to authenticated
  with check (usuario_id = auth.uid() and public.puede_reportar());

create policy "borrar mi reporte en revisión" on public.reportes
  for delete to authenticated
  using (usuario_id = auth.uid() and estado = 'en_revision');

-- Casos
create policy "ver casos" on public.casos
  for select to authenticated
  using (public.puede_ver_caso(id) or public.es_caso_de_mis_reportes(id));

-- Historial: administrador, y encargados en los casos que pueden ver
create policy "ver historial" on public.caso_historial
  for select to authenticated
  using (public.es_admin() or (caso_id is not null and public.puede_ver_caso(caso_id)));

create policy "ver exclusiones" on public.caso_exclusiones
  for select to authenticated
  using (public.es_admin() or encargado_id = auth.uid());

-- ---------------------------------------------------------------------
-- Funciones: nadie las ejecuta salvo a quien se le concede
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.mi_rol(),
  public.tiene_2fa(),
  public.es_admin(),
  public.es_encargado(),
  public.encargado_cubre(integer),
  public.puede_ver_caso(uuid),
  public.es_caso_de_mis_reportes(uuid),
  public.puede_reportar(),
  public.distancia_m(double precision, double precision, double precision, double precision),
  public.config(),
  public.estado_para_reportar(),
  public.casos_mapa(),
  public.aprobar_reporte(uuid, uuid),
  public.rechazar_reporte(uuid, text, boolean),
  public.sugerir_duplicados(uuid),
  public.unir_casos(uuid, uuid),
  public.casos_cercanos(uuid),
  public.tomar_caso(uuid),
  public.soltar_caso(uuid, public.motivo_soltar, text),
  public.finalizar_caso(uuid, text, text),
  public.asignar_caso(uuid, uuid),
  public.reabrir_caso(uuid, text),
  public.buscar_personas(text, public.rol_usuario, boolean),
  public.cambiar_rol(uuid, public.rol_usuario),
  public.definir_zonas(uuid, integer[]),
  public.cambiar_bloqueo(uuid, boolean)
to authenticated;

-- Solo para la Edge Function (clave de servicio)
grant execute on function public.id_por_correo(text) to service_role;
grant execute on function public.liberar_casos_vencidos() to service_role;

-- Las funciones nuevas que se creen después tampoco quedan abiertas por defecto
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
