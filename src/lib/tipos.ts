// Tipos que reflejan las tablas de supabase/migrations.
// Si cambias la base, puedes generar tipos automáticos con:
//   npx supabase gen types typescript --project-id TU_ID > src/lib/basedatos.ts

export type Rol = 'usuario' | 'encargado' | 'admin';
export type Especie = 'perro' | 'gato' | 'otro';
export type EstadoRevision = 'en_revision' | 'aprobado' | 'rechazado';
export type EstadoCaso = 'pendiente' | 'en_accion' | 'finalizado' | 'unido';
export type MotivoSoltar = 'jurisdiccion' | 'no_puedo_llegar' | 'otro';

export interface Perfil {
  id: string;
  nombre: string;
  telefono: string | null;
  canton_id: number | null;
  acepto_privacidad_en: string | null;
  rol: Rol;
  advertencias: number;
  bloqueado: boolean;
}

export interface Provincia {
  id: number;
  nombre: string;
}

export interface Canton {
  id: number;
  provincia_id: number;
  nombre: string;
}

export interface CantonConProvincia {
  nombre: string;
  provincia: { nombre: string } | null;
}

export interface Reporte {
  id: string;
  usuario_id: string | null;
  especie: Especie;
  descripcion: string;
  referencia: string;
  canton_id: number;
  lat: number;
  lng: number;
  precision_m: number | null;
  foto_path: string;
  capturado_en: string;
  estado: EstadoRevision;
  motivo_rechazo: string | null;
  caso_id: string | null;
  creado_en: string;
}

export interface Caso {
  id: string;
  canton_id: number;
  lat: number;
  lng: number;
  especie: Especie;
  estado: EstadoCaso;
  encargado_id: string | null;
  tomado_en: string | null;
  finalizado_en: string | null;
  foto_evidencia: string | null;
  nota_final: string | null;
  unido_a: string | null;
  creado_en: string;
}

export interface Historial {
  id: number;
  caso_id: string | null;
  reporte_id: string | null;
  actor_id: string | null;
  accion: string;
  motivo: string | null;
  detalle: Record<string, unknown>;
  creado_en: string;
}

export interface Configuracion {
  duplicados_metros: number;
  duplicados_horas: number;
  limite_reportes_dia: number;
  advertencias_para_bloqueo: number;
  horas_auto_soltar: number;
  dias_maximos_reporte: number;
  dias_mapa: number;
}

export interface Persona {
  id: string;
  nombre: string;
  correo: string;
  telefono: string | null;
  rol: Rol;
  canton: string | null;
  provincia: string | null;
  advertencias: number;
  bloqueado: boolean;
  creado_en: string;
  zonas: number[];
}

export interface Duplicado {
  tipo: 'caso' | 'reporte';
  id: string;
  distancia_m: number;
  horas: number;
  estado: string;
  especie: Especie;
}

export const ESPECIES: Record<Especie, string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Otro animal',
};

export const ESTADOS_CASO: Record<EstadoCaso, string> = {
  pendiente: 'Pendiente',
  en_accion: 'Tomando acción',
  finalizado: 'Finalizado',
  unido: 'Unido a otro caso',
};

export const ESTADOS_REVISION: Record<EstadoRevision, string> = {
  en_revision: 'En revisión',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
};

export const MOTIVOS_SOLTAR: Record<MotivoSoltar, string> = {
  jurisdiccion: 'No corresponde a mi jurisdicción',
  no_puedo_llegar: 'No puedo llegar al lugar',
  otro: 'Otro motivo',
};

export const ROLES: Record<Rol, string> = {
  usuario: 'Usuario',
  encargado: 'Encargado',
  admin: 'Administrador',
};

export const ACCIONES_HISTORIAL: Record<string, string> = {
  caso_creado: 'Caso creado',
  reporte_aprobado: 'Reporte aprobado',
  reporte_rechazado: 'Reporte rechazado',
  reporte_unido: 'Reporte unido al caso',
  casos_unidos: 'Casos unidos',
  tomado: 'Caso tomado',
  soltado: 'Caso soltado',
  auto_soltado: 'Liberado automáticamente por tiempo',
  asignado: 'Asignado por el administrador',
  finalizado: 'Finalizado',
  reabierto: 'Reabierto',
};
