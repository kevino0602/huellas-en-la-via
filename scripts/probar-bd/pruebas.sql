-- =====================================================================
-- Pruebas del flujo completo y de la seguridad por rol.
-- Se ejecutan con scripts/probar-bd/probar.sh
-- Cada bloque cambia de identidad con prueba.como('<persona>', '<aal>')
-- y "set role authenticated", igual que hace Supabase con cada petición.
-- =====================================================================
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
set client_min_messages = warning;

-- ---------------------------------------------------------------------
-- Ayudantes
-- ---------------------------------------------------------------------
create schema prueba;
grant usage on schema prueba to authenticated;

create function prueba.uid(p text) returns uuid language sql immutable as $$
  select case p
    when 'admin' then 'a0000000-0000-4000-8000-000000000001'
    when 'enc1'  then 'e0000000-0000-4000-8000-000000000001'
    when 'enc2'  then 'e0000000-0000-4000-8000-000000000002'
    when 'u1'    then 'b0000000-0000-4000-8000-000000000001'
    when 'u2'    then 'b0000000-0000-4000-8000-000000000002'
    when 'u3'    then 'b0000000-0000-4000-8000-000000000003'
  end::uuid;
$$;

create function prueba.como(p text, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims',
           json_build_object('sub', prueba.uid(p), 'role', 'authenticated', 'aal', p_aal)::text, false);
$$;

create function prueba.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'FALLÓ: %', p_msg;
  end if;
  raise notice 'ok  %', p_msg;
end;
$$;

-- Ejecuta SQL que DEBE fallar; si no falla, la prueba se detiene
create function prueba.falla(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok  % → «%»', p_msg, sqlerrm;
    return;
  end;
  raise exception 'FALLÓ (debía rechazarse): %', p_msg;
end;
$$;

-- Guarda ids entre bloques
create table prueba.ids (k text primary key, v uuid);
grant select, insert, update on prueba.ids to authenticated;
create function prueba.id(p text) returns uuid language sql stable as $$ select v from prueba.ids where k = p $$;
create function prueba.guardar(p text, v uuid) returns uuid language sql as $$
  insert into prueba.ids values (p, v) on conflict (k) do update set v = excluded.v returning v;
$$;
grant execute on all functions in schema prueba to authenticated;

set client_min_messages = notice;

-- ---------------------------------------------------------------------
-- Datos iniciales (como administrador de la base)
-- ---------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  (prueba.uid('admin'), 'admin@huellas.ec', '{"nombre":"Kevin Admin"}'),
  (prueba.uid('enc1'),  'enc1@ambato.ec',   '{"nombre":"Encargada Ambato"}'),
  (prueba.uid('enc2'),  'enc2@pelileo.ec',  '{"nombre":"Encargado Pelileo"}'),
  (prueba.uid('u1'),    'u1@gmail.com',     '{"nombre":"Usuaria Uno","rol":"admin"}'),
  (prueba.uid('u2'),    'u2@hotmail.com',   '{"full_name":"Usuario Dos"}'),
  (prueba.uid('u3'),    'u3@yahoo.com',     '{}');

select prueba.ok((select count(*) = 6 from public.perfiles), 'el registro crea un perfil por cuenta');
select prueba.ok((select rol = 'usuario' from public.perfiles where id = prueba.uid('u1')),
                 'el rol enviado en los metadatos del registro se ignora');

update public.perfiles set rol = 'admin' where id = prueba.uid('admin');
update public.perfiles set rol = 'encargado' where id in (prueba.uid('enc1'), prueba.uid('enc2'));
insert into public.encargado_zonas
select prueba.uid('enc1'), id from public.cantones where nombre = 'Ambato'
union all
select prueba.uid('enc2'), id from public.cantones where nombre = 'Pelileo';
update public.configuracion set limite_reportes_dia = 3;

create function prueba.canton(p text) returns integer language sql stable as $$
  select id from public.cantones where nombre = p limit 1
$$;
grant execute on function prueba.canton(text) to authenticated;
select prueba.ok((select count(*) = 221 from public.cantones), 'hay 221 cantones cargados');

-- ---------------------------------------------------------------------
-- Usuario 1: perfil y reporte
-- ---------------------------------------------------------------------
select prueba.como('u1');
set role authenticated;

select prueba.falla($$
  insert into public.reportes (especie, canton_id, lat, lng, foto_path, capturado_en)
  values ('perro', prueba.canton('Ambato'), -1.2491, -78.6168, 'b0000000-0000-4000-8000-000000000001/x.jpg', now())
$$, 'no se puede reportar con el perfil incompleto');

update public.perfiles
   set nombre = 'Usuaria Uno', telefono = '+593987654321', canton_id = prueba.canton('Ambato'),
       acepto_privacidad_en = '2000-01-01'
 where id = auth.uid();
select prueba.ok((select acepto_privacidad_en > now() - interval '1 minute' from public.perfiles where id = auth.uid()),
                 'la fecha de aceptación de privacidad la pone el servidor');

select prueba.falla($$ update public.perfiles set rol = 'admin' where id = auth.uid() $$,
                    'un usuario no puede darse rol de administrador');
select prueba.falla($$ update public.perfiles set bloqueado = false, advertencias = 0 where id = auth.uid() $$,
                    'un usuario no puede quitarse advertencias');
select prueba.falla($$ update public.perfiles set telefono = '0987' where id = auth.uid() $$,
                    'el teléfono debe tener formato internacional');
select prueba.ok((select count(*) = 1 from public.perfiles), 'un usuario solo ve su propio perfil');

select prueba.ok((public.estado_para_reportar() ->> 'restantes')::int = 3, 'quedan 3 reportes hoy');

insert into storage.objects (bucket_id, name) values ('reportes', 'b0000000-0000-4000-8000-000000000001/r1.jpg');
select prueba.falla($$ insert into storage.objects (bucket_id, name) values ('reportes', 'b0000000-0000-4000-8000-000000000002/robo.jpg') $$,
                    'no se puede subir una foto en la carpeta de otro');

with x as (insert into public.reportes (especie, canton_id, lat, lng, precision_m, foto_path, capturado_en, referencia)
  values ('perro', prueba.canton('Ambato'), -1.249100, -78.616800, 12,
          'b0000000-0000-4000-8000-000000000001/r1.jpg', now() - interval '20 minutes', 'Av. Atahualpa')
  returning id) select prueba.guardar('r1', id) from x;
select prueba.ok((select estado = 'en_revision' and usuario_id = auth.uid() from public.reportes where id = prueba.id('r1')),
                 'el reporte nace en revisión y a nombre de quien lo sube');

select prueba.falla($$
  insert into public.reportes (especie, canton_id, lat, lng, foto_path, capturado_en, estado)
  values ('perro', prueba.canton('Ambato'), -1.2, -78.6, 'b0000000-0000-4000-8000-000000000002/ajena.jpg', now(), 'aprobado')
$$, 'no se puede usar la foto de otra persona');

select prueba.falla($$
  insert into public.reportes (especie, canton_id, lat, lng, foto_path, capturado_en)
  values ('perro', prueba.canton('Ambato'), -1.2, -78.6, 'b0000000-0000-4000-8000-000000000001/vieja.jpg', now() - interval '30 days')
$$, 'no se aceptan fotos de hace más de 7 días');

select prueba.falla($$ update public.reportes set estado = 'aprobado' $$, 'un usuario no puede aprobar su reporte');

-- Dos reportes más para probar el límite diario (3)
insert into public.reportes (especie, canton_id, lat, lng, foto_path, capturado_en)
values ('gato', prueba.canton('Ambato'), -1.30, -78.60, 'b0000000-0000-4000-8000-000000000001/r1b.jpg', now()),
       ('otro', prueba.canton('Ambato'), -1.31, -78.61, 'b0000000-0000-4000-8000-000000000001/r1c.jpg', now());
select prueba.falla($$
  insert into public.reportes (especie, canton_id, lat, lng, foto_path, capturado_en)
  values ('perro', prueba.canton('Ambato'), -1.32, -78.62, 'b0000000-0000-4000-8000-000000000001/r1d.jpg', now())
$$, 'se respeta el límite de reportes por día');

-- Borrar uno propio en revisión
delete from public.reportes where foto_path like '%/r1c.jpg';
select prueba.ok((select count(*) = 2 from public.reportes), 'el usuario borra su reporte en revisión');
reset role;

-- ---------------------------------------------------------------------
-- Usuario 2 reporta el mismo animal a ~40 m
-- ---------------------------------------------------------------------
update public.perfiles set nombre = 'Usuario Dos', telefono = '+593991112233',
       canton_id = prueba.canton('Ambato'), acepto_privacidad_en = now() where id = prueba.uid('u2');
select prueba.como('u2');
set role authenticated;
insert into storage.objects (bucket_id, name) values ('reportes', 'b0000000-0000-4000-8000-000000000002/r2.jpg');
with x as (insert into public.reportes (especie, canton_id, lat, lng, foto_path, capturado_en)
  values ('perro', prueba.canton('Ambato'), -1.249400, -78.616700,
          'b0000000-0000-4000-8000-000000000002/r2.jpg', now() - interval '5 minutes')
  returning id) select prueba.guardar('r2', id) from x;
select prueba.ok((select count(*) = 1 from public.reportes), 'un usuario no ve reportes de otros');
select prueba.ok((select count(*) = 0 from storage.objects where name like 'b0000000-0000-4000-8000-000000000001/%'),
                 'un usuario no ve fotos de otros');
reset role;

-- ---------------------------------------------------------------------
-- Encargado antes de la aprobación: no ve nada
-- ---------------------------------------------------------------------
select prueba.como('enc1', 'aal2');
set role authenticated;
select prueba.ok((select count(*) = 0 from public.reportes), 'el encargado no ve reportes sin aprobar');
reset role;

-- ---------------------------------------------------------------------
-- Administrador: 2FA, duplicados y aprobación
-- ---------------------------------------------------------------------
select prueba.como('admin', 'aal1');
set role authenticated;
select prueba.falla(format('select public.aprobar_reporte(%L)', prueba.id('r1')),
                    'el administrador sin 2FA no puede aprobar');
select prueba.ok((select count(*) = 1 from public.perfiles), 'el administrador sin 2FA solo ve su perfil');

select prueba.como('admin', 'aal2');
select prueba.ok((select count(*) = 6 from public.perfiles), 'el administrador con 2FA ve todos los perfiles');
select prueba.ok((select count(*) = 1 from public.sugerir_duplicados(prueba.id('r1')) where tipo = 'reporte' and id = prueba.id('r2')),
                 'se sugiere el reporte de u2 como duplicado de r1 (≈35 m)');
select prueba.ok((select round(distancia_m) between 30 and 40 from public.sugerir_duplicados(prueba.id('r1')) limit 1),
                 'la distancia sugerida es correcta');

select prueba.guardar('c1', public.aprobar_reporte(prueba.id('r1')));
select prueba.ok((select count(*) = 1 from public.sugerir_duplicados(prueba.id('r2')) where tipo = 'caso' and id = prueba.id('c1')),
                 'tras aprobar r1, r2 sugiere unirse al caso c1');
select public.aprobar_reporte(prueba.id('r2'), prueba.id('c1'));
select prueba.ok((select count(*) = 2 from public.reportes where caso_id = prueba.id('c1')),
                 'dos reportes del mismo animal quedan en un solo caso');
select prueba.falla(format('select public.aprobar_reporte(%L)', prueba.id('r1')), 'no se aprueba dos veces');
reset role;

-- ---------------------------------------------------------------------
-- Usuarios ven el avance de su caso y el mapa
-- ---------------------------------------------------------------------
select prueba.como('u1');
set role authenticated;
select prueba.ok((select estado = 'pendiente' from public.casos where id = prueba.id('c1')), 'u1 ve que su caso está pendiente');
select prueba.ok((select count(*) = 1 from public.reportes where caso_id = prueba.id('c1')),
                 'u1 no ve el reporte de u2 aunque estén en el mismo caso');
select prueba.ok((select count(*) = 1 from public.casos_mapa()), 'u1 ve el caso en el mapa de su cantón');
select prueba.falla(format('select public.tomar_caso(%L)', prueba.id('c1')), 'un usuario no puede tomar casos');
reset role;

select prueba.como('u3');
set role authenticated;
select prueba.ok((select count(*) = 0 from public.casos), 'un usuario ajeno no ve el caso');
select prueba.ok((select count(*) = 0 from public.casos_mapa()), 'sin cantón en el perfil no hay mapa');
reset role;

-- ---------------------------------------------------------------------
-- Encargados: zonas, 2FA, tomar y soltar
-- ---------------------------------------------------------------------
select prueba.como('enc2', 'aal2');
set role authenticated;
select prueba.ok((select count(*) = 0 from public.casos), 'el encargado de Pelileo no ve casos de Ambato');
select prueba.falla(format('select public.tomar_caso(%L)', prueba.id('c1')), 'no puede tomar casos fuera de su zona');
reset role;

select prueba.como('enc1', 'aal1');
set role authenticated;
select prueba.falla(format('select public.tomar_caso(%L)', prueba.id('c1')), 'el encargado sin 2FA no puede tomar');
select prueba.como('enc1', 'aal2');
select prueba.ok((select count(*) = 1 from public.casos), 'el encargado de Ambato ve el caso');
select prueba.ok((select count(*) = 2 from public.reportes where caso_id = prueba.id('c1')), 've los dos reportes del caso');
select prueba.ok((select count(*) = 2 from storage.objects where bucket_id = 'reportes'), 've las fotos de los reportes del caso');
select prueba.ok((select count(*) = 1 from public.perfiles), 'el encargado no ve los datos de quien reportó');
select public.tomar_caso(prueba.id('c1'));
select prueba.ok((select estado = 'en_accion' from public.casos where id = prueba.id('c1')), 'el caso pasa a tomando acción');
select prueba.falla(format('select public.tomar_caso(%L)', prueba.id('c1')), 'no se puede tomar dos veces');
select prueba.falla(format($q$ update public.casos set estado = 'finalizado' where id = %L $q$, prueba.id('c1')),
                    'no se puede cambiar el estado sin pasar por las funciones');
select prueba.falla(format($q$ select public.soltar_caso(%L, 'otro', '') $q$, prueba.id('c1')),
                    'soltar con motivo "otro" exige una nota');
select public.soltar_caso(prueba.id('c1'), 'jurisdiccion', 'Es del lado de Pelileo');
select prueba.ok((select count(*) = 0 from public.casos), 'tras soltar por jurisdicción ya no le aparece');
select prueba.falla(format('select public.tomar_caso(%L)', prueba.id('c1')), 'no puede volver a tomarlo por error');
reset role;

-- ---------------------------------------------------------------------
-- Administrador asigna a otro encargado; finalizar con evidencia
-- ---------------------------------------------------------------------
select prueba.como('admin', 'aal2');
set role authenticated;
select public.asignar_caso(prueba.id('c1'), prueba.uid('enc2'));
reset role;

select prueba.como('enc2', 'aal2');
set role authenticated;
select prueba.ok((select estado = 'en_accion' and encargado_id = auth.uid() from public.casos where id = prueba.id('c1')),
                 'el encargado asignado ve el caso aunque sea de otra zona');
select prueba.falla(format($q$ select public.finalizar_caso(%L, 'e0000000-0000-4000-8000-000000000002/no-existe.jpg') $q$, prueba.id('c1')),
                    'no se finaliza sin foto de evidencia subida');
insert into storage.objects (bucket_id, name) values ('evidencias', 'e0000000-0000-4000-8000-000000000002/c1-1.jpg');
select public.finalizar_caso(prueba.id('c1'), 'e0000000-0000-4000-8000-000000000002/c1-1.jpg', 'Levantado y entregado al GAD');
select prueba.ok((select estado = 'finalizado' from public.casos where id = prueba.id('c1')), 'el caso queda finalizado');
reset role;

select prueba.como('u1');
set role authenticated;
select prueba.falla($$ insert into storage.objects (bucket_id, name) values ('evidencias', 'b0000000-0000-4000-8000-000000000001/x.jpg') $$,
                    'un usuario no puede subir evidencias');
select prueba.ok((select estado = 'finalizado' from public.casos where id = prueba.id('c1')), 'u1 ve su caso finalizado');
delete from public.reportes where id = prueba.id('r1');
select prueba.ok((select count(*) = 1 from public.reportes where id = prueba.id('r1')), 'no se puede borrar un reporte ya aprobado');
reset role;

-- ---------------------------------------------------------------------
-- Reabrir, unir casos y historial
-- ---------------------------------------------------------------------
select prueba.como('admin', 'aal2');
set role authenticated;
select prueba.falla(format($q$ select public.reabrir_caso(%L, '') $q$, prueba.id('c1')), 'reabrir exige motivo');
select public.reabrir_caso(prueba.id('c1'), 'La foto de evidencia no muestra el lugar');
select prueba.ok((select estado = 'pendiente' and foto_evidencia is null from public.casos where id = prueba.id('c1')),
                 'el caso reabierto vuelve a pendiente');

-- Un tercer reporte aprobado por separado y luego unido
reset role;
select prueba.como('u2');
set role authenticated;
insert into storage.objects (bucket_id, name) values ('reportes', 'b0000000-0000-4000-8000-000000000002/r3.jpg');
with x as (insert into public.reportes (especie, canton_id, lat, lng, foto_path, capturado_en)
  values ('perro', prueba.canton('Ambato'), -1.249200, -78.616900, 'b0000000-0000-4000-8000-000000000002/r3.jpg', now())
  returning id) select prueba.guardar('r3', id) from x;
reset role;
select prueba.como('admin', 'aal2');
set role authenticated;
select prueba.guardar('c2', public.aprobar_reporte(prueba.id('r3')));
select prueba.ok((select count(*) >= 1 from public.casos_cercanos(prueba.id('c2')) where id = prueba.id('c1')),
                 'el caso nuevo muestra al otro como cercano');
select public.unir_casos(prueba.id('c1'), prueba.id('c2'));
select prueba.ok((select estado = 'unido' and unido_a = prueba.id('c1') from public.casos where id = prueba.id('c2')),
                 'el caso secundario queda unido al principal');
select prueba.ok((select count(*) = 3 from public.reportes where caso_id = prueba.id('c1')),
                 'el caso principal reúne los tres reportes');
select prueba.ok((select array_agg(accion order by id) @> array['caso_creado','reporte_aprobado','reporte_unido','tomado','soltado','asignado','finalizado','reabierto','casos_unidos']
                  from public.caso_historial where caso_id = prueba.id('c1')),
                 'el historial registra cada paso');
reset role;

-- ---------------------------------------------------------------------
-- Advertencias y bloqueo
-- ---------------------------------------------------------------------
update public.configuracion set advertencias_para_bloqueo = 2;
update public.perfiles set nombre = 'Usuario Tres', telefono = '+593999000111',
       canton_id = prueba.canton('Ambato'), acepto_privacidad_en = now() where id = prueba.uid('u3');
select prueba.como('u3');
set role authenticated;
insert into storage.objects (bucket_id, name) values ('reportes', 'b0000000-0000-4000-8000-000000000003/f1.jpg'),
                                                     ('reportes', 'b0000000-0000-4000-8000-000000000003/f2.jpg');
with x as (insert into public.reportes (especie, canton_id, lat, lng, foto_path, capturado_en)
  values ('perro', prueba.canton('Ambato'), -1.5, -78.5, 'b0000000-0000-4000-8000-000000000003/f1.jpg', now()) returning id) select prueba.guardar('f1', id) from x;
with x as (insert into public.reportes (especie, canton_id, lat, lng, foto_path, capturado_en)
  values ('perro', prueba.canton('Ambato'), -1.6, -78.5, 'b0000000-0000-4000-8000-000000000003/f2.jpg', now()) returning id) select prueba.guardar('f2', id) from x;
reset role;

select prueba.como('admin', 'aal2');
set role authenticated;
select prueba.falla(format($q$ select public.rechazar_reporte(%L, '') $q$, prueba.id('f1')), 'rechazar exige motivo');
select public.rechazar_reporte(prueba.id('f1'), 'Foto descargada de internet', true);
select public.rechazar_reporte(prueba.id('f2'), 'Foto repetida', true);
select prueba.ok((select bloqueado and advertencias = 2 from public.perfiles where id = prueba.uid('u3')),
                 'dos reportes falsos bloquean la cuenta');
select prueba.ok((select count(*) = 1 from public.buscar_personas('', null, true)), 'el administrador ve la lista de bloqueados');
reset role;

select prueba.como('u3');
set role authenticated;
select prueba.ok((select (public.estado_para_reportar() ->> 'bloqueado')::boolean), 'la app sabe que la cuenta está bloqueada');
select prueba.falla($$ insert into storage.objects (bucket_id, name) values ('reportes', 'b0000000-0000-4000-8000-000000000003/f3.jpg') $$,
                    'una cuenta bloqueada no puede subir fotos');
select prueba.ok((select count(*) = 0 from public.buscar_personas()), 'un usuario no puede buscar personas');
reset role;

-- ---------------------------------------------------------------------
-- Roles y zonas
-- ---------------------------------------------------------------------
select prueba.como('admin', 'aal2');
set role authenticated;
select prueba.falla(format($q$ select public.cambiar_rol(%L, 'usuario') $q$, prueba.uid('admin')),
                    'un administrador no puede quitarse su propio rol');
select public.cambiar_bloqueo(prueba.uid('u3'), false);
select public.cambiar_rol(prueba.uid('u3'), 'encargado');
select public.definir_zonas(prueba.uid('u3'), array[prueba.canton('Ambato'), prueba.canton('Baños de Agua Santa')]);
select prueba.ok((select zonas = array[prueba.canton('Ambato'), prueba.canton('Baños de Agua Santa')] and rol = 'encargado'
                  from public.buscar_personas('u3@yahoo') ), 'el administrador asigna rol y zonas');
-- Asigna c1 a enc1 para probar la liberación automática
select public.asignar_caso(prueba.id('c1'), prueba.uid('enc1'));
reset role;

-- ---------------------------------------------------------------------
-- Liberación automática de casos vencidos (la corre pg_cron)
-- ---------------------------------------------------------------------
update public.casos set tomado_en = now() - interval '25 hours' where id = prueba.id('c1');
select prueba.ok(public.liberar_casos_vencidos() = 1, 'se libera el caso tomado hace más de 24 horas');
select prueba.ok((select estado = 'pendiente' from public.casos where id = prueba.id('c1')), 'el caso vuelve a pendiente');

select prueba.como('enc1', 'aal2');
set role authenticated;
select prueba.falla('select public.liberar_casos_vencidos()', 'un encargado no puede ejecutar la tarea del sistema');
reset role;

\echo
\echo '✔ Todas las pruebas pasaron'
