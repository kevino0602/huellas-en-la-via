import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { COLOR_ESTADO, MapaPuntos } from '../../componentes/MapaPuntos';
import { Aviso, Cargando, Encabezado } from '../../componentes/ui';
import { fecha } from '../../lib/formato';
import { mensajeError, rpc } from '../../lib/supabase';
import { useTerritorio } from '../../lib/territorio';
import { ESPECIES, ESTADOS_CASO, type Especie, type EstadoCaso } from '../../lib/tipos';

interface CasoMapa {
  id: string;
  lat: number;
  lng: number;
  especie: Especie;
  estado: EstadoCaso;
  creado_en: string;
}

/** Casos aprobados del cantón del usuario, sin datos de quién reportó */
export function Mapa() {
  const { perfil } = useAuth();
  const territorio = useTerritorio();
  const [casos, setCasos] = useState<CasoMapa[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rpc<CasoMapa[]>('casos_mapa')
      .then(setCasos)
      .catch((e) => {
        setError(mensajeError(e));
        setCasos([]);
      });
  }, []);

  const puntos = useMemo(
    () =>
      (casos ?? []).map((c) => ({
        id: c.id,
        lat: c.lat,
        lng: c.lng,
        color: COLOR_ESTADO[c.estado] ?? '#666',
        contenido: (
          <>
            <strong>{ESPECIES[c.especie]}</strong>
            <br />
            {ESTADOS_CASO[c.estado]}
            <br />
            {fecha(c.creado_en)}
          </>
        ),
      })),
    [casos],
  );

  if (!casos) return <Cargando />;

  const cuenta = (e: EstadoCaso) => casos.filter((c) => c.estado === e).length;

  return (
    <div className="pagina">
      <Encabezado titulo="Mapa de tu zona">
        {territorio?.nombreCanton(perfil?.canton_id)} · casos aprobados de los últimos días
      </Encabezado>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <MapaPuntos puntos={puntos} alto={420} />
      <ul className="leyenda">
        {(['pendiente', 'en_accion', 'finalizado'] as EstadoCaso[]).map((e) => (
          <li key={e}>
            <span className="punto" style={{ background: COLOR_ESTADO[e] }} aria-hidden="true" />
            {ESTADOS_CASO[e]} <strong>{cuenta(e)}</strong>
          </li>
        ))}
      </ul>
      <p className="ayuda">Si el animal que viste ya aparece aquí como pendiente o en acción, no hace falta reportarlo de nuevo.</p>
    </div>
  );
}
