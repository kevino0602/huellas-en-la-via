import { createStore, del, get, keys, set } from 'idb-keyval';
import { supabase } from './supabase';
import type { Especie } from './tipos';

// =====================================================================
// Reportes guardados sin señal.
// Se guardan en el celular (IndexedDB) con la foto, la ubicación y la hora
// del momento, y se envían solos cuando vuelve la conexión.
// El id del reporte se genera en el celular: si un envío se corta a la
// mitad y se repite, no se crean reportes duplicados.
// =====================================================================

export interface DatosReporte {
  especie: Especie;
  descripcion: string;
  referencia: string;
  canton_id: number;
  lat: number;
  lng: number;
  precision_m: number;
  capturado_en: string;
}

export interface ReportePendiente {
  id: string;
  usuarioId: string;
  foto: Blob;
  datos: DatosReporte;
  guardadoEn: string;
  ultimoError?: string;
}

const almacen = createStore('huellas-en-la-via', 'reportes-pendientes');
export const eventosCola = new EventTarget();

function avisarCambio() {
  eventosCola.dispatchEvent(new Event('cambio'));
}

export async function guardarPendiente(r: ReportePendiente): Promise<void> {
  await set(r.id, r, almacen);
  avisarCambio();
}

export async function listarPendientes(usuarioId: string): Promise<ReportePendiente[]> {
  const ids = await keys<string>(almacen);
  const todos = await Promise.all(ids.map((k) => get<ReportePendiente>(k, almacen)));
  return todos
    .filter((r): r is ReportePendiente => Boolean(r) && r!.usuarioId === usuarioId)
    .sort((a, b) => a.guardadoEn.localeCompare(b.guardadoEn));
}

export async function descartarPendiente(id: string): Promise<void> {
  await del(id, almacen);
  avisarCambio();
}

export function esErrorDeRed(e: unknown): boolean {
  if (!navigator.onLine) return true;
  const texto = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  return /Failed to fetch|NetworkError|Load failed|network|timeout/i.test(texto);
}

/** Sube la foto y crea el reporte. Se puede repetir sin duplicar. */
export async function enviarReporte(r: Pick<ReportePendiente, 'id' | 'usuarioId' | 'foto' | 'datos'>): Promise<void> {
  const ruta = `${r.usuarioId}/${r.id}.jpg`;

  const subida = await supabase.storage
    .from('reportes')
    .upload(ruta, r.foto, { contentType: 'image/jpeg', upsert: false });
  if (subida.error && !/already exists|duplicate/i.test(subida.error.message)) {
    throw subida.error;
  }

  const { error } = await supabase.from('reportes').insert({ id: r.id, foto_path: ruta, ...r.datos });
  if (error && error.code !== '23505') {
    // Si el reporte no se pudo crear, la foto no debe quedar huérfana
    if (!esErrorDeRed(error)) await supabase.storage.from('reportes').remove([ruta]);
    throw error;
  }
}

let enviando = false;

/** Intenta enviar todo lo pendiente. Se detiene al primer problema de red. */
export async function enviarPendientes(usuarioId: string): Promise<{ enviados: number; conError: number }> {
  if (enviando || !navigator.onLine) return { enviados: 0, conError: 0 };
  enviando = true;
  let enviados = 0;
  let conError = 0;
  try {
    for (const r of await listarPendientes(usuarioId)) {
      try {
        await enviarReporte(r);
        await del(r.id, almacen);
        enviados++;
      } catch (e) {
        if (esErrorDeRed(e)) break;
        conError++;
        const mensaje = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Error';
        await set(r.id, { ...r, ultimoError: mensaje }, almacen);
      }
    }
  } finally {
    enviando = false;
    avisarCambio();
  }
  return { enviados, conError };
}
