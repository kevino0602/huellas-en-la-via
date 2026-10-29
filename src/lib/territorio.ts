import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Canton, Provincia } from './tipos';

export interface Territorio {
  provincias: Provincia[];
  cantones: Canton[];
  nombreCanton: (id: number | null | undefined) => string;
}

let cache: Promise<Territorio> | null = null;

async function cargar(): Promise<Territorio> {
  const [p, c] = await Promise.all([
    supabase.from('provincias').select('id, nombre').order('nombre'),
    supabase.from('cantones').select('id, provincia_id, nombre').order('nombre'),
  ]);
  if (p.error) throw p.error;
  if (c.error) throw c.error;
  const provincias = p.data as Provincia[];
  const cantones = c.data as Canton[];
  const porId = new Map(cantones.map((x) => [x.id, x]));
  const provPorId = new Map(provincias.map((x) => [x.id, x]));
  return {
    provincias,
    cantones,
    nombreCanton: (id) => {
      const canton = id ? porId.get(id) : undefined;
      if (!canton) return '';
      return `${canton.nombre}, ${provPorId.get(canton.provincia_id)?.nombre ?? ''}`;
    },
  };
}

/** Provincias y cantones (se cargan una sola vez por sesión) */
export function useTerritorio(): Territorio | null {
  const [t, setT] = useState<Territorio | null>(null);
  useEffect(() => {
    cache ??= cargar().catch((e) => {
      cache = null;
      throw e;
    });
    let vivo = true;
    cache.then((x) => vivo && setT(x)).catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);
  return t;
}
