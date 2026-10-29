import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { TarjetaCaso } from '../../componentes/TarjetaCaso';
import { Aviso, Cargando, Encabezado, Vacio } from '../../componentes/ui';
import { SELECT_CASO, useConfiguracion, type CasoDetallado } from '../../lib/consultas';
import { mensajeError, supabase } from '../../lib/supabase';

type Pestana = 'zona' | 'mios' | 'finalizados';

export function horasRestantes(tomadoEn: string | null, horasLimite: number): number | null {
  if (!tomadoEn) return null;
  const ms = new Date(tomadoEn).getTime() + horasLimite * 3600_000 - Date.now();
  return Math.max(0, Math.round(ms / 3600_000));
}

export function CasosEncargado() {
  const { perfil } = useAuth();
  const configuracion = useConfiguracion();
  const [pestana, setPestana] = useState<Pestana>('zona');
  const [casos, setCasos] = useState<CasoDetallado[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!perfil) return;
    setCasos(null);
    let consulta = supabase.from('casos').select(SELECT_CASO);
    if (pestana === 'zona') consulta = consulta.eq('estado', 'pendiente').order('creado_en', { ascending: true });
    if (pestana === 'mios')
      consulta = consulta.eq('estado', 'en_accion').eq('encargado_id', perfil.id).order('tomado_en');
    if (pestana === 'finalizados')
      consulta = consulta
        .eq('estado', 'finalizado')
        .eq('encargado_id', perfil.id)
        .order('finalizado_en', { ascending: false })
        .limit(50);
    const { data, error } = await consulta;
    if (error) setError(mensajeError(error));
    setCasos((data as CasoDetallado[] | null) ?? []);
  }, [perfil, pestana]);

  useEffect(() => {
    void cargar();
    // Refresca al volver a la app (por ejemplo, después de ir al lugar)
    const alVolver = () => document.visibilityState === 'visible' && void cargar();
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [cargar]);

  return (
    <div className="pagina">
      <Encabezado titulo="Casos">Animales aprobados en tus cantones.</Encabezado>
      <div className="pestanas" role="tablist">
        <button type="button" role="tab" aria-selected={pestana === 'zona'} onClick={() => setPestana('zona')}>
          Pendientes
        </button>
        <button type="button" role="tab" aria-selected={pestana === 'mios'} onClick={() => setPestana('mios')}>
          Tomando acción
        </button>
        <button type="button" role="tab" aria-selected={pestana === 'finalizados'} onClick={() => setPestana('finalizados')}>
          Finalizados
        </button>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!casos ? (
        <Cargando />
      ) : casos.length === 0 ? (
        <Vacio
          titulo={
            pestana === 'zona'
              ? 'No hay casos pendientes en tu zona'
              : pestana === 'mios'
                ? 'No tienes casos en acción'
                : 'Aún no has finalizado casos'
          }
        >
          {pestana === 'zona' && <p>Cuando el administrador apruebe un reporte de tus cantones, aparecerá aquí.</p>}
        </Vacio>
      ) : (
        <ul className="lista">
          {casos.map((c) => {
            const restantes =
              pestana === 'mios' && configuracion ? horasRestantes(c.tomado_en, configuracion.horas_auto_soltar) : null;
            return (
              <TarjetaCaso
                key={c.id}
                caso={c}
                extra={restantes != null ? `Se libera solo en ${restantes} h si no lo finalizas.` : undefined}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
