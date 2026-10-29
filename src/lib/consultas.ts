import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { CantonConProvincia, Caso, Configuracion, Reporte } from './tipos';

// Los nombres después de "!" indican qué relación usar cuando hay más de una
// entre dos tablas (por ejemplo casos → perfiles por encargado y por creador).
export const SELECT_CASO = `
  *,
  canton:cantones!casos_canton_id_fkey(nombre, provincia:provincias(nombre)),
  encargado:perfiles!casos_encargado_id_fkey(nombre),
  reportes:reportes!reportes_caso_id_fkey(id, especie, referencia, descripcion, foto_path, capturado_en, precision_m, lat, lng)
`;

export type ReporteDeCaso = Pick<
  Reporte,
  'id' | 'especie' | 'referencia' | 'descripcion' | 'foto_path' | 'capturado_en' | 'precision_m' | 'lat' | 'lng'
>;

export type CasoDetallado = Caso & {
  canton: CantonConProvincia | null;
  encargado: { nombre: string } | null;
  reportes: ReporteDeCaso[];
};

let cacheConfig: Promise<Configuracion | null> | null = null;

/** Reglas de negocio de la tabla public.configuracion */
export function useConfiguracion(): Configuracion | null {
  const [c, setC] = useState<Configuracion | null>(null);
  useEffect(() => {
    cacheConfig ??= Promise.resolve(
      supabase
        .from('configuracion')
        .select('*')
        .maybeSingle()
        .then(({ data }) => data as Configuracion | null),
    );
    let vivo = true;
    cacheConfig.then((x) => vivo && setC(x));
    return () => {
      vivo = false;
    };
  }, []);
  return c;
}

/** Texto de la referencia principal de un caso (la del primer reporte) */
export function referenciaCaso(c: CasoDetallado): string {
  const primero = [...c.reportes].sort((a, b) => a.capturado_en.localeCompare(b.capturado_en))[0];
  return primero?.referencia || 'Sin referencia';
}

export function lugarCaso(c: CasoDetallado): string {
  return c.canton ? `${c.canton.nombre}, ${c.canton.provincia?.nombre ?? ''}` : '';
}
