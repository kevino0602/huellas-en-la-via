-- =====================================================================
-- Huellas en la Vía · Esquema base
-- Tablas, tipos y disparadores. Las reglas de acceso (RLS) están en
-- 20261028170300_seguridad.sql y las acciones del flujo en
-- 20261028170200_funciones.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.rol_usuario     as enum ('usuario', 'encargado', 'admin');
create type public.especie_animal  as enum ('perro', 'gato', 'otro');
-- Revisión del administrador sobre lo que sube un usuario
create type public.estado_revision as enum ('en_revision', 'aprobado', 'rechazado');
-- Vida del caso una vez aprobado
create type public.estado_caso     as enum ('pendiente', 'en_accion', 'finalizado', 'unido');
create type public.motivo_soltar   as enum ('jurisdiccion', 'no_puedo_llegar', 'otro');

-- ---------------------------------------------------------------------
-- Configuración (una sola fila). Cambia estos números sin tocar código:
--   update public.configuracion set limite_reportes_dia = 10;
-- ---------------------------------------------------------------------
create table public.configuracion (
  id                        boolean primary key default true check (id),
  duplicados_metros         integer not null default 100 check (duplicados_metros between 10 and 5000),
  duplicados_horas          integer not null default 6   check (duplicados_horas between 1 and 168),
  limite_reportes_dia       integer not null default 5   check (limite_reportes_dia between 1 and 100),
  advertencias_para_bloqueo integer not null default 3   check (advertencias_para_bloqueo between 1 and 20),
  horas_auto_soltar         integer not null default 24  check (horas_auto_soltar between 1 and 720),
  dias_maximos_reporte      integer not null default 7   check (dias_maximos_reporte between 1 and 60),
  dias_mapa                 integer not null default 30  check (dias_mapa between 1 and 365)
);
insert into public.configuracion default values;

comment on column public.configuracion.duplicados_metros         is 'Distancia máxima para sugerir que dos reportes son el mismo animal.';
comment on column public.configuracion.duplicados_horas          is 'Diferencia máxima de horas entre dos reportes en revisión para sugerirlos como duplicados.';
comment on column public.configuracion.limite_reportes_dia       is 'Reportes que un usuario puede subir en 24 horas.';
comment on column public.configuracion.advertencias_para_bloqueo is 'Reportes falsos que bloquean a un usuario.';
comment on column public.configuracion.horas_auto_soltar         is 'Horas que un encargado puede tener un caso sin finalizarlo antes de que se suelte solo.';
comment on column public.configuracion.dias_maximos_reporte      is 'Antigüedad máxima de la foto (por reportes guardados sin señal).';
comment on column public.configuracion.dias_mapa                 is 'Días de casos que ve un usuario en el mapa de su zona.';

-- ---------------------------------------------------------------------
-- Territorio
-- ---------------------------------------------------------------------
create table public.provincias (
  id     smallint primary key,
  nombre text not null unique
);

create table public.cantones (
  id           integer generated always as identity primary key,
  provincia_id smallint not null references public.provincias (id),
  nombre       text not null,
  unique (provincia_id, nombre)
);
create index cantones_provincia_idx on public.cantones (provincia_id);

-- ---------------------------------------------------------------------
-- Perfiles (uno por cuenta de auth.users)
-- ---------------------------------------------------------------------
create table public.perfiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  nombre               text not null default '' check (char_length(nombre) <= 80),
  -- Formato internacional E.164, por ejemplo +593987654321
  telefono             text check (telefono ~ '^\+[1-9][0-9]{7,14}$'),
  canton_id            integer references public.cantones (id),
  acepto_privacidad_en timestamptz,
  rol                  public.rol_usuario not null default 'usuario',
  advertencias         integer not null default 0 check (advertencias >= 0),
  bloqueado            boolean not null default false,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);
create index perfiles_rol_idx on public.perfiles (rol) where rol <> 'usuario';

-- Cantones que atiende cada encargado
create table public.encargado_zonas (
  encargado_id uuid    not null references public.perfiles (id) on delete cascade,
  canton_id    integer not null references public.cantones (id),
  primary key (encargado_id, canton_id)
);
create index encargado_zonas_canton_idx on public.encargado_zonas (canton_id);

-- ---------------------------------------------------------------------
-- Casos: lo que ven y atienden los encargados.
-- Un caso nace cuando el administrador aprueba un reporte, y puede
-- reunir varios reportes del mismo animal.
-- ---------------------------------------------------------------------
create table public.casos (
  id              uuid primary key default gen_random_uuid(),
  canton_id       integer not null references public.cantones (id),
  lat             double precision not null check (lat between -90 and 90),
  lng             double precision not null check (lng between -180 and 180),
  especie         public.especie_animal not null,
  estado          public.estado_caso not null default 'pendiente',
  encargado_id    uuid references public.perfiles (id) on delete set null,
  tomado_en       timestamptz,
  finalizado_en   timestamptz,
  foto_evidencia  text,
  nota_final      text check (char_length(nota_final) <= 500),
  unido_a         uuid references public.casos (id),
  creado_por      uuid references public.perfiles (id) on delete set null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint caso_en_accion_tiene_encargado
    check (estado <> 'en_accion' or (encargado_id is not null and tomado_en is not null)),
  constraint caso_finalizado_tiene_evidencia
    check (estado <> 'finalizado' or (foto_evidencia is not null and finalizado_en is not null)),
  constraint caso_unido_tiene_destino
    check (estado <> 'unido' or unido_a is not null),
  constraint caso_no_se_une_a_si_mismo
    check (unido_a is null or unido_a <> id)
);
create index casos_canton_estado_idx on public.casos (canton_id, estado);
create index casos_encargado_idx     on public.casos (encargado_id) where encargado_id is not null;
create index casos_en_accion_idx     on public.casos (tomado_en) where estado = 'en_accion';

-- ---------------------------------------------------------------------
-- Reportes: lo que sube cada usuario (foto + GPS obligatorios)
-- ---------------------------------------------------------------------
create table public.reportes (
  id             uuid primary key default gen_random_uuid(),
  -- Si el usuario elimina su cuenta, el reporte queda anónimo
  usuario_id     uuid references public.perfiles (id) on delete set null,
  especie        public.especie_animal not null,
  descripcion    text not null default '' check (char_length(descripcion) <= 500),
  referencia     text not null default '' check (char_length(referencia) <= 200),
  canton_id      integer not null references public.cantones (id),
  lat            double precision not null check (lat between -90 and 90),
  lng            double precision not null check (lng between -180 and 180),
  precision_m    real check (precision_m >= 0),
  -- Ruta dentro del bucket "reportes": <usuario_id>/<reporte_id>.jpg
  foto_path      text not null,
  -- Momento en que se tomó la foto (puede ser antes del envío si no había señal)
  capturado_en   timestamptz not null,
  estado         public.estado_revision not null default 'en_revision',
  motivo_rechazo text check (char_length(motivo_rechazo) <= 300),
  caso_id        uuid references public.casos (id),
  revisado_por   uuid references public.perfiles (id) on delete set null,
  revisado_en    timestamptz,
  creado_en      timestamptz not null default now(),
  constraint reporte_aprobado_tiene_caso check (estado <> 'aprobado' or caso_id is not null),
  constraint reporte_foto_unica unique (foto_path)
);
create index reportes_revision_idx on public.reportes (creado_en) where estado = 'en_revision';
create index reportes_usuario_idx  on public.reportes (usuario_id, creado_en desc);
create index reportes_caso_idx     on public.reportes (caso_id) where caso_id is not null;

-- ---------------------------------------------------------------------
-- Historial: quién hizo qué y cuándo
-- ---------------------------------------------------------------------
create table public.caso_historial (
  id          bigint generated always as identity primary key,
  caso_id     uuid references public.casos (id) on delete cascade,
  reporte_id  uuid references public.reportes (id) on delete cascade,
  actor_id    uuid references public.perfiles (id) on delete set null, -- null = el sistema
  accion      text not null check (accion in (
                'caso_creado', 'reporte_aprobado', 'reporte_rechazado', 'reporte_unido',
                'casos_unidos', 'tomado', 'soltado', 'auto_soltado', 'asignado',
                'finalizado', 'reabierto')),
  motivo      text,
  detalle     jsonb not null default '{}'::jsonb,
  creado_en   timestamptz not null default now()
);
create index caso_historial_caso_idx    on public.caso_historial (caso_id, creado_en);
create index caso_historial_reporte_idx on public.caso_historial (reporte_id);

-- Encargados que soltaron un caso por jurisdicción: ya no lo vuelven a ver
create table public.caso_exclusiones (
  caso_id      uuid not null references public.casos (id) on delete cascade,
  encargado_id uuid not null references public.perfiles (id) on delete cascade,
  creado_en    timestamptz not null default now(),
  primary key (caso_id, encargado_id)
);

-- ---------------------------------------------------------------------
-- Disparadores
-- ---------------------------------------------------------------------

-- Crea el perfil al registrarse. Solo se toma el nombre de los metadatos:
-- el rol NUNCA se lee de datos que controla el usuario.
create or replace function public.crear_perfil_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre)
  values (
    new.id,
    left(trim(coalesce(new.raw_user_meta_data ->> 'nombre',
                       new.raw_user_meta_data ->> 'full_name',
                       new.raw_user_meta_data ->> 'name', '')), 80)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo();

create or replace function public.tocar_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger perfiles_actualizado before update on public.perfiles
  for each row execute function public.tocar_actualizado_en();
create trigger casos_actualizado before update on public.casos
  for each row execute function public.tocar_actualizado_en();

-- La fecha de aceptación de la política de privacidad la pone el servidor
create or replace function public.sellar_privacidad()
returns trigger
language plpgsql
as $$
begin
  if new.acepto_privacidad_en is not null
     and new.acepto_privacidad_en is distinct from old.acepto_privacidad_en then
    new.acepto_privacidad_en := now();
  end if;
  return new;
end;
$$;

create trigger perfiles_privacidad before update on public.perfiles
  for each row execute function public.sellar_privacidad();
