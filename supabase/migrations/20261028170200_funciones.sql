-- =====================================================================
-- Huellas en la Vía · Funciones
-- Toda acción que cambia el estado de un reporte o de un caso pasa por
-- una de estas funciones. Las tablas no permiten escribir esos campos
-- directamente, así nadie puede saltarse las reglas desde el navegador.
--
-- Convención: las funciones "security definer" fijan search_path y
-- verifican el rol al inicio. Los mensajes de error están en español
-- porque la app los muestra tal cual.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ayudantes de identidad
-- ---------------------------------------------------------------------

create or replace function public.mi_rol()
returns public.rol_usuario
language sql stable security definer
set search_path = public
as $$
  select rol from public.perfiles where id = auth.uid();
$$;

-- Verificación en dos pasos completada en esta sesión
create or replace function public.tiene_2fa()
returns boolean
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- Administradores y encargados solo actúan con la verificación en dos pasos
create or replace function public.es_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.mi_rol() = 'admin', false) and public.tiene_2fa();
$$;

create or replace function public.es_encargado()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.mi_rol() = 'encargado', false) and public.tiene_2fa();
$$;

create or replace function public.encargado_cubre(p_canton integer)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.encargado_zonas
    where encargado_id = auth.uid() and canton_id = p_canton
  );
$$;

-- ¿Puede quien llama ver este caso como encargado o administrador?
create or replace function public.puede_ver_caso(p_caso uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.es_admin()
      or (public.es_encargado() and exists (
            select 1 from public.casos c
            where c.id = p_caso
              and (
                c.encargado_id = auth.uid()
                or (
                  c.estado <> 'unido'
                  and public.encargado_cubre(c.canton_id)
                  and not exists (
                    select 1 from public.caso_exclusiones x
                    where x.caso_id = c.id and x.encargado_id = auth.uid()
                  )
                )
              )
          ));
$$;

-- ¿Este caso tiene algún reporte de quien llama? (para que el usuario
-- vea en qué va su reporte)
create or replace function public.es_caso_de_mis_reportes(p_caso uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.reportes r
    where r.caso_id = p_caso and r.usuario_id = auth.uid()
  );
$$;

-- Perfil completo, política aceptada y sin bloqueo
create or replace function public.puede_reportar()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles p
    where p.id = auth.uid()
      and p.nombre <> ''
      and p.telefono is not null
      and p.canton_id is not null
      and p.acepto_privacidad_en is not null
      and not p.bloqueado
  );
$$;

-- Distancia en metros entre dos puntos (fórmula de Haversine)
create or replace function public.distancia_m(lat1 double precision, lng1 double precision,
                                              lat2 double precision, lng2 double precision)
returns double precision
language sql immutable
as $$
  select 2 * 6371000 * asin(sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2)
         + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
         ));
$$;

create or replace function public.config()
returns public.configuracion
language sql stable security definer
set search_path = public
as $$
  select * from public.configuracion limit 1;
$$;

-- ---------------------------------------------------------------------
-- Usuario: reportar
-- ---------------------------------------------------------------------

-- Lo que la app necesita saber antes de abrir la cámara
create or replace function public.estado_para_reportar()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_perfil public.perfiles;
  v_usados integer;
  v_cfg    public.configuracion := public.config();
begin
  select * into v_perfil from public.perfiles where id = auth.uid();
  if not found then
    raise exception 'Inicia sesión para reportar.';
  end if;

  select count(*) into v_usados
  from public.reportes
  where usuario_id = auth.uid() and creado_en > now() - interval '24 hours';

  return jsonb_build_object(
    'perfil_completo', v_perfil.nombre <> '' and v_perfil.telefono is not null
                       and v_perfil.canton_id is not null and v_perfil.acepto_privacidad_en is not null,
    'bloqueado', v_perfil.bloqueado,
    'limite', v_cfg.limite_reportes_dia,
    'restantes', greatest(v_cfg.limite_reportes_dia - v_usados, 0),
    'dias_maximos_reporte', v_cfg.dias_maximos_reporte
  );
end;
$$;

-- Antes de guardar un reporte: fija los campos que no decide el usuario
-- y aplica el límite diario.
create or replace function public.antes_de_crear_reporte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg    public.configuracion := public.config();
  v_usados integer;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para reportar.';
  end if;

  new.usuario_id     := auth.uid();
  new.estado         := 'en_revision';
  new.caso_id        := null;
  new.motivo_rechazo := null;
  new.revisado_por   := null;
  new.revisado_en    := null;
  new.creado_en      := now();

  if not public.puede_reportar() then
    raise exception 'Completa tu perfil antes de reportar, o revisa si tu cuenta está bloqueada.';
  end if;

  if new.foto_path not like auth.uid()::text || '/%' then
    raise exception 'La foto no pertenece a tu cuenta.';
  end if;

  if new.capturado_en > now() + interval '10 minutes' then
    raise exception 'La hora de la foto no es válida.';
  end if;
  if new.capturado_en < now() - make_interval(days => v_cfg.dias_maximos_reporte) then
    raise exception 'La foto tiene más de % días y ya no se puede reportar.', v_cfg.dias_maximos_reporte;
  end if;

  -- Evita que dos envíos simultáneos se salten el límite
  perform pg_advisory_xact_lock(hashtext('reportes:' || auth.uid()::text));
  select count(*) into v_usados
  from public.reportes
  where usuario_id = auth.uid() and creado_en > now() - interval '24 hours';

  if v_usados >= v_cfg.limite_reportes_dia then
    raise exception 'Llegaste al límite de % reportes en 24 horas. Intenta más tarde.', v_cfg.limite_reportes_dia;
  end if;

  return new;
end;
$$;

create trigger reportes_antes_de_crear
  before insert on public.reportes
  for each row execute function public.antes_de_crear_reporte();

-- Mapa del usuario: casos aprobados de su cantón, sin datos de quién reportó
create or replace function public.casos_mapa()
returns table (
  id uuid, lat double precision, lng double precision,
  especie public.especie_animal, estado public.estado_caso, creado_en timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select c.id, c.lat, c.lng, c.especie, c.estado, c.creado_en
  from public.casos c
  join public.perfiles p on p.id = auth.uid()
  where c.canton_id = p.canton_id
    and c.estado in ('pendiente', 'en_accion', 'finalizado')
    and c.creado_en > now() - make_interval(days => (public.config()).dias_mapa)
  order by c.creado_en desc
  limit 500;
$$;

-- ---------------------------------------------------------------------
-- Administrador: revisar reportes
-- ---------------------------------------------------------------------

-- Aprueba un reporte. Sin p_caso crea un caso nuevo; con p_caso lo une
-- a un caso abierto (mismo animal reportado por otra persona).
create or replace function public.aprobar_reporte(p_reporte uuid, p_caso uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep  public.reportes;
  v_caso public.casos;
  v_id   uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador con verificación en dos pasos puede aprobar reportes.';
  end if;

  select * into v_rep from public.reportes where id = p_reporte for update;
  if not found then
    raise exception 'El reporte no existe.';
  end if;
  if v_rep.estado <> 'en_revision' then
    raise exception 'Este reporte ya fue revisado.';
  end if;

  if p_caso is null then
    insert into public.casos (canton_id, lat, lng, especie, creado_por)
    values (v_rep.canton_id, v_rep.lat, v_rep.lng, v_rep.especie, auth.uid())
    returning id into v_id;

    insert into public.caso_historial (caso_id, reporte_id, actor_id, accion)
    values (v_id, p_reporte, auth.uid(), 'caso_creado');
  else
    select * into v_caso from public.casos where id = p_caso for update;
    if not found then
      raise exception 'El caso no existe.';
    end if;
    if v_caso.estado not in ('pendiente', 'en_accion') then
      raise exception 'Solo se puede unir a un caso pendiente o en acción.';
    end if;
    v_id := p_caso;

    insert into public.caso_historial (caso_id, reporte_id, actor_id, accion)
    values (v_id, p_reporte, auth.uid(), 'reporte_unido');
  end if;

  update public.reportes
     set estado = 'aprobado', caso_id = v_id, revisado_por = auth.uid(), revisado_en = now()
   where id = p_reporte;

  insert into public.caso_historial (caso_id, reporte_id, actor_id, accion)
  values (v_id, p_reporte, auth.uid(), 'reporte_aprobado');

  return v_id;
end;
$$;

-- Rechaza un reporte. Si es falso suma una advertencia y, al llegar al
-- límite, bloquea al usuario.
create or replace function public.rechazar_reporte(p_reporte uuid, p_motivo text, p_es_falso boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario uuid;
  v_cfg     public.configuracion := public.config();
  v_adv     integer;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador con verificación en dos pasos puede rechazar reportes.';
  end if;
  if coalesce(char_length(trim(p_motivo)), 0) < 3 then
    raise exception 'Escribe el motivo del rechazo.';
  end if;

  update public.reportes
     set estado = 'rechazado', motivo_rechazo = left(trim(p_motivo), 300),
         revisado_por = auth.uid(), revisado_en = now()
   where id = p_reporte and estado = 'en_revision'
  returning usuario_id into v_usuario;

  if not found then
    raise exception 'Este reporte ya fue revisado o no existe.';
  end if;

  if p_es_falso and v_usuario is not null then
    update public.perfiles
       set advertencias = advertencias + 1,
           bloqueado    = bloqueado or (advertencias + 1) >= v_cfg.advertencias_para_bloqueo
     where id = v_usuario
    returning advertencias into v_adv;
  end if;

  insert into public.caso_historial (reporte_id, actor_id, accion, motivo, detalle)
  values (p_reporte, auth.uid(), 'reporte_rechazado', left(trim(p_motivo), 300),
          jsonb_build_object('es_falso', p_es_falso, 'advertencias', v_adv));
end;
$$;

-- Sugiere duplicados de un reporte en revisión: casos abiertos cercanos
-- y otros reportes en revisión cercanos en distancia y tiempo.
create or replace function public.sugerir_duplicados(p_reporte uuid)
returns table (
  tipo text, id uuid, distancia_m double precision, horas double precision,
  estado text, especie public.especie_animal
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_rep  public.reportes;
  v_cfg  public.configuracion := public.config();
  v_grad double precision;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede ver sugerencias de duplicados.';
  end if;
  select * into v_rep from public.reportes r where r.id = p_reporte;
  if not found then
    return;
  end if;
  -- Filtro rápido por rectángulo antes de calcular la distancia exacta
  v_grad := v_cfg.duplicados_metros / 111000.0 * 1.5;

  return query
  select 'caso'::text, c.id,
         public.distancia_m(v_rep.lat, v_rep.lng, c.lat, c.lng),
         (abs(extract(epoch from (c.creado_en - v_rep.capturado_en))) / 3600.0)::double precision,
         c.estado::text, c.especie
  from public.casos c
  where c.estado in ('pendiente', 'en_accion')
    and c.lat between v_rep.lat - v_grad and v_rep.lat + v_grad
    and c.lng between v_rep.lng - v_grad and v_rep.lng + v_grad
    and public.distancia_m(v_rep.lat, v_rep.lng, c.lat, c.lng) <= v_cfg.duplicados_metros
  union all
  select 'reporte'::text, r.id,
         public.distancia_m(v_rep.lat, v_rep.lng, r.lat, r.lng),
         (abs(extract(epoch from (r.capturado_en - v_rep.capturado_en))) / 3600.0)::double precision,
         r.estado::text, r.especie
  from public.reportes r
  where r.estado = 'en_revision'
    and r.id <> v_rep.id
    and r.lat between v_rep.lat - v_grad and v_rep.lat + v_grad
    and r.lng between v_rep.lng - v_grad and v_rep.lng + v_grad
    and public.distancia_m(v_rep.lat, v_rep.lng, r.lat, r.lng) <= v_cfg.duplicados_metros
    and abs(extract(epoch from (r.capturado_en - v_rep.capturado_en))) <= v_cfg.duplicados_horas * 3600
  order by 3;
end;
$$;

-- Une dos casos: los reportes del secundario pasan al principal
create or replace function public.unir_casos(p_principal uuid, p_secundario uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pri public.casos;
  v_sec public.casos;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede unir casos.';
  end if;
  if p_principal = p_secundario then
    raise exception 'Elige dos casos distintos.';
  end if;

  -- Bloquea en orden fijo para evitar bloqueos cruzados
  perform 1 from public.casos where id in (p_principal, p_secundario) order by id for update;
  select * into v_pri from public.casos where id = p_principal;
  select * into v_sec from public.casos where id = p_secundario;
  if v_pri.id is null or v_sec.id is null then
    raise exception 'Uno de los casos no existe.';
  end if;
  if v_pri.estado not in ('pendiente', 'en_accion') then
    raise exception 'El caso principal debe estar pendiente o en acción.';
  end if;
  if v_sec.estado <> 'pendiente' then
    raise exception 'El caso que se une debe estar pendiente. Si ya lo tomó un encargado, únelo al revés.';
  end if;

  update public.reportes set caso_id = p_principal where caso_id = p_secundario;
  update public.casos set estado = 'unido', unido_a = p_principal where id = p_secundario;

  insert into public.caso_historial (caso_id, actor_id, accion, detalle) values
    (p_principal, auth.uid(), 'casos_unidos', jsonb_build_object('recibe', p_secundario)),
    (p_secundario, auth.uid(), 'casos_unidos', jsonb_build_object('unido_a', p_principal));
end;
$$;

-- Casos abiertos cercanos a otro caso (para unir desde el detalle)
create or replace function public.casos_cercanos(p_caso uuid)
returns table (id uuid, distancia_m double precision, estado public.estado_caso,
               especie public.especie_animal, creado_en timestamptz)
language sql stable security definer
set search_path = public
as $$
  select c.id, public.distancia_m(b.lat, b.lng, c.lat, c.lng), c.estado, c.especie, c.creado_en
  from public.casos b
  join public.casos c on c.id <> b.id and c.estado in ('pendiente', 'en_accion')
  where b.id = p_caso
    and public.es_admin()
    and public.distancia_m(b.lat, b.lng, c.lat, c.lng) <= (public.config()).duplicados_metros * 3
  order by 2
  limit 20;
$$;

-- ---------------------------------------------------------------------
-- Encargado: tomar, soltar y finalizar
-- ---------------------------------------------------------------------

create or replace function public.tomar_caso(p_caso uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_encargado() then
    raise exception 'Solo un encargado con verificación en dos pasos puede tomar casos.';
  end if;

  -- El "where estado = pendiente" hace que, si dos encargados tocan a la
  -- vez, solo uno lo consiga.
  update public.casos
     set estado = 'en_accion', encargado_id = auth.uid(), tomado_en = now()
   where id = p_caso
     and estado = 'pendiente'
     and public.encargado_cubre(canton_id)
     and not exists (select 1 from public.caso_exclusiones x
                     where x.caso_id = p_caso and x.encargado_id = auth.uid());
  if not found then
    raise exception 'No se pudo tomar el caso: ya lo tomó otro encargado o no está en tu zona.';
  end if;

  insert into public.caso_historial (caso_id, actor_id, accion)
  values (p_caso, auth.uid(), 'tomado');
end;
$$;

create or replace function public.soltar_caso(p_caso uuid, p_motivo public.motivo_soltar, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_encargado() then
    raise exception 'Solo un encargado puede soltar casos.';
  end if;
  if p_motivo = 'otro' and coalesce(char_length(trim(p_nota)), 0) < 3 then
    raise exception 'Cuenta brevemente por qué sueltas el caso.';
  end if;

  update public.casos
     set estado = 'pendiente', encargado_id = null, tomado_en = null
   where id = p_caso and estado = 'en_accion' and encargado_id = auth.uid();
  if not found then
    raise exception 'Solo puedes soltar un caso que tengas en acción.';
  end if;

  if p_motivo = 'jurisdiccion' then
    insert into public.caso_exclusiones (caso_id, encargado_id)
    values (p_caso, auth.uid())
    on conflict do nothing;
  end if;

  insert into public.caso_historial (caso_id, actor_id, accion, motivo, detalle)
  values (p_caso, auth.uid(), 'soltado', p_motivo::text,
          jsonb_build_object('nota', left(trim(coalesce(p_nota, '')), 300)));
end;
$$;

-- La foto de evidencia debe estar ya subida al bucket "evidencias",
-- dentro de la carpeta del encargado.
create or replace function public.finalizar_caso(p_caso uuid, p_foto text, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if not public.es_encargado() then
    raise exception 'Solo un encargado puede finalizar casos.';
  end if;
  if p_foto is null or p_foto not like auth.uid()::text || '/%' then
    raise exception 'Sube la foto de evidencia antes de finalizar.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'evidencias' and o.name = p_foto) then
    raise exception 'No se encontró la foto de evidencia. Vuelve a tomarla.';
  end if;

  update public.casos
     set estado = 'finalizado', finalizado_en = now(), foto_evidencia = p_foto,
         nota_final = nullif(left(trim(coalesce(p_nota, '')), 500), '')
   where id = p_caso and estado = 'en_accion' and encargado_id = auth.uid();
  if not found then
    raise exception 'Solo puedes finalizar un caso que tengas en acción.';
  end if;

  insert into public.caso_historial (caso_id, actor_id, accion)
  values (p_caso, auth.uid(), 'finalizado');
end;
$$;

-- ---------------------------------------------------------------------
-- Administrador: asignar y reabrir
-- ---------------------------------------------------------------------

create or replace function public.asignar_caso(p_caso uuid, p_encargado uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede asignar casos.';
  end if;
  if not exists (select 1 from public.perfiles where id = p_encargado and rol = 'encargado') then
    raise exception 'La persona elegida no es encargado.';
  end if;

  select encargado_id into v_anterior from public.casos where id = p_caso for update;

  update public.casos
     set estado = 'en_accion', encargado_id = p_encargado, tomado_en = now()
   where id = p_caso and estado in ('pendiente', 'en_accion');
  if not found then
    raise exception 'Solo se puede asignar un caso pendiente o en acción.';
  end if;

  -- La decisión del administrador pasa por encima de una exclusión previa
  delete from public.caso_exclusiones where caso_id = p_caso and encargado_id = p_encargado;

  insert into public.caso_historial (caso_id, actor_id, accion, detalle)
  values (p_caso, auth.uid(), 'asignado',
          jsonb_build_object('encargado', p_encargado, 'anterior', v_anterior));
end;
$$;

create or replace function public.reabrir_caso(p_caso uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caso public.casos;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede reabrir casos.';
  end if;
  if coalesce(char_length(trim(p_motivo)), 0) < 3 then
    raise exception 'Escribe por qué reabres el caso.';
  end if;

  select * into v_caso from public.casos where id = p_caso for update;
  if not found or v_caso.estado <> 'finalizado' then
    raise exception 'Solo se puede reabrir un caso finalizado.';
  end if;

  update public.casos
     set estado = 'pendiente', encargado_id = null, tomado_en = null,
         finalizado_en = null, foto_evidencia = null, nota_final = null
   where id = p_caso;

  -- La evidencia anterior queda guardada en el historial
  insert into public.caso_historial (caso_id, actor_id, accion, motivo, detalle)
  values (p_caso, auth.uid(), 'reabierto', left(trim(p_motivo), 300),
          jsonb_build_object('encargado_anterior', v_caso.encargado_id,
                             'foto_evidencia_anterior', v_caso.foto_evidencia,
                             'nota_anterior', v_caso.nota_final,
                             'finalizado_en_anterior', v_caso.finalizado_en));
end;
$$;

-- ---------------------------------------------------------------------
-- Administrador: personas
-- ---------------------------------------------------------------------

create or replace function public.buscar_personas(p_texto text default '', p_rol public.rol_usuario default null,
                                                  p_solo_bloqueados boolean default false)
returns table (
  id uuid, nombre text, correo text, telefono text, rol public.rol_usuario,
  canton text, provincia text, advertencias integer, bloqueado boolean, creado_en timestamptz,
  zonas integer[]
)
language sql stable security definer
set search_path = public, auth
as $$
  select p.id, p.nombre, u.email::text, p.telefono, p.rol,
         c.nombre, pr.nombre, p.advertencias, p.bloqueado, p.creado_en,
         coalesce((select array_agg(z.canton_id order by z.canton_id)
                   from public.encargado_zonas z where z.encargado_id = p.id), '{}')
  from public.perfiles p
  join auth.users u on u.id = p.id
  left join public.cantones c on c.id = p.canton_id
  left join public.provincias pr on pr.id = c.provincia_id
  where public.es_admin()
    and (p_rol is null or p.rol = p_rol)
    and (not p_solo_bloqueados or p.bloqueado)
    and (coalesce(p_texto, '') = ''
         or p.nombre ilike '%' || p_texto || '%'
         or u.email ilike '%' || p_texto || '%'
         or p.telefono like '%' || p_texto || '%')
  order by p.rol desc, p.nombre
  limit 100;
$$;

create or replace function public.cambiar_rol(p_persona uuid, p_rol public.rol_usuario)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actual public.rol_usuario;
  v_caso   record;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar roles.';
  end if;
  if p_persona = auth.uid() then
    raise exception 'No puedes cambiar tu propio rol. Pídeselo a otro administrador.';
  end if;

  select rol into v_actual from public.perfiles where id = p_persona for update;
  if not found then
    raise exception 'La persona no existe.';
  end if;
  if v_actual = p_rol then
    return;
  end if;

  -- Si deja de ser encargado, sus casos en acción vuelven a pendiente
  if v_actual = 'encargado' then
    for v_caso in
      select id from public.casos where encargado_id = p_persona and estado = 'en_accion' for update
    loop
      update public.casos set estado = 'pendiente', encargado_id = null, tomado_en = null
       where id = v_caso.id;
      insert into public.caso_historial (caso_id, actor_id, accion, motivo)
      values (v_caso.id, auth.uid(), 'soltado', 'cambio_de_rol');
    end loop;
    delete from public.encargado_zonas where encargado_id = p_persona;
  end if;

  update public.perfiles set rol = p_rol where id = p_persona;
end;
$$;

create or replace function public.definir_zonas(p_encargado uuid, p_cantones integer[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede asignar zonas.';
  end if;
  if not exists (select 1 from public.perfiles where id = p_encargado and rol = 'encargado') then
    raise exception 'La persona no es encargado.';
  end if;
  if coalesce(array_length(p_cantones, 1), 0) = 0 then
    raise exception 'Elige al menos un cantón.';
  end if;

  delete from public.encargado_zonas where encargado_id = p_encargado;
  insert into public.encargado_zonas (encargado_id, canton_id)
  select p_encargado, unnest(p_cantones)
  on conflict do nothing;
end;
$$;

create or replace function public.cambiar_bloqueo(p_persona uuid, p_bloqueado boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede bloquear o desbloquear cuentas.';
  end if;
  if p_persona = auth.uid() then
    raise exception 'No puedes bloquear tu propia cuenta.';
  end if;
  update public.perfiles
     set bloqueado = p_bloqueado,
         advertencias = case when p_bloqueado then advertencias else 0 end
   where id = p_persona;
end;
$$;

-- Solo para la Edge Function de invitación (rol service_role)
create or replace function public.id_por_correo(p_correo text)
returns uuid
language sql stable security definer
set search_path = auth
as $$
  select id from auth.users where lower(email) = lower(p_correo) limit 1;
$$;

-- ---------------------------------------------------------------------
-- Sistema: casos tomados que nadie finalizó
-- La ejecuta pg_cron (ver 20261028170500_tareas_programadas.sql)
-- ---------------------------------------------------------------------
create or replace function public.liberar_casos_vencidos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_horas integer := (public.config()).horas_auto_soltar;
  v_caso  record;
  v_total integer := 0;
begin
  for v_caso in
    select id, encargado_id, tomado_en from public.casos
    where estado = 'en_accion' and tomado_en < now() - make_interval(hours => v_horas)
    for update skip locked
  loop
    update public.casos set estado = 'pendiente', encargado_id = null, tomado_en = null
     where id = v_caso.id;
    insert into public.caso_historial (caso_id, actor_id, accion, motivo, detalle)
    values (v_caso.id, null, 'auto_soltado', 'tiempo_vencido',
            jsonb_build_object('encargado', v_caso.encargado_id, 'tomado_en', v_caso.tomado_en,
                               'horas', v_horas));
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;
