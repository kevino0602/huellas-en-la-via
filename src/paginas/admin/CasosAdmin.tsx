import { useCallback, useEffect, useState } from 'react';
import { TarjetaCaso } from '../../componentes/TarjetaCaso';
import { Aviso, Cargando, Encabezado, Vacio } from '../../componentes/ui';
import { SELECT_CASO, type CasoDetallado } from '../../lib/consultas';
import { mensajeError, supabase } from '../../lib/supabase';
import { useTerritorio } from '../../lib/territorio';
import { ESTADOS_CASO, type EstadoCaso } from '../../lib/tipos';

export function CasosAdmin() {
  const territorio = useTerritorio();
  const [estado, setEstado] = useState<EstadoCaso>('pendiente');
  const [provincia, setProvincia] = useState<number | ''>('');
  const [casos, setCasos] = useState<CasoDetallado[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCasos(null);
    let consulta = supabase
      .from('casos')
      .select(SELECT_CASO)
      .eq('estado', estado)
      .order('creado_en', { ascending: estado === 'pendiente' })
      .limit(100);
    if (provincia && territorio) {
      const ids = territorio.cantones.filter((c) => c.provincia_id === provincia).map((c) => c.id);
      consulta = consulta.in('canton_id', ids);
    }
    const { data, error } = await consulta;
    if (error) setError(mensajeError(error));
    setCasos((data as CasoDetallado[] | null) ?? []);
  }, [estado, provincia, territorio]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="pagina">
      <Encabezado titulo="Todos los casos" />
      <div className="fila-2">
        <div className="campo">
          <label htmlFor="filtro-estado">Estado</label>
          <select id="filtro-estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoCaso)}>
            {(Object.keys(ESTADOS_CASO) as EstadoCaso[]).map((k) => (
              <option key={k} value={k}>
                {ESTADOS_CASO[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="filtro-provincia">Provincia</label>
          <select
            id="filtro-provincia"
            value={provincia}
            onChange={(e) => setProvincia(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Todas</option>
            {territorio?.provincias.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!casos ? (
        <Cargando />
      ) : casos.length === 0 ? (
        <Vacio titulo={`No hay casos en estado «${ESTADOS_CASO[estado]}»`} />
      ) : (
        <ul className="lista">
          {casos.map((c) => (
            <TarjetaCaso
              key={c.id}
              caso={c}
              extra={c.encargado?.nombre ? `Encargado: ${c.encargado.nombre}` : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
