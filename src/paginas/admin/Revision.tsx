import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { FotoPrivada } from '../../componentes/FotoPrivada';
import { COLOR_ESTADO, MapaPuntos } from '../../componentes/MapaPuntos';
import { Aviso, Cargando, Encabezado, Vacio } from '../../componentes/ui';
import { config } from '../../config';
import { fecha, haceCuanto, metros, telefonoLegible } from '../../lib/formato';
import { mensajeError, rpc, supabase } from '../../lib/supabase';
import { ESPECIES, type CantonConProvincia, type Duplicado, type Reporte } from '../../lib/tipos';

type ReporteRevision = Reporte & {
  canton: CantonConProvincia | null;
  autor: { nombre: string; telefono: string | null; advertencias: number; bloqueado: boolean } | null;
};

const OTRO = '__otro__';

export function Revision() {
  const [reportes, setReportes] = useState<ReporteRevision[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('reportes')
      .select(
        '*, canton:cantones!reportes_canton_id_fkey(nombre, provincia:provincias(nombre)), autor:perfiles!reportes_usuario_id_fkey(nombre, telefono, advertencias, bloqueado)',
      )
      .eq('estado', 'en_revision')
      .order('creado_en', { ascending: true })
      .limit(50);
    if (error) setError(mensajeError(error));
    setReportes((data as ReporteRevision[] | null) ?? []);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (!reportes) return <Cargando />;

  return (
    <div className="pagina">
      <Encabezado titulo="Reportes por revisar">
        Confirma que cada reporte es real antes de que lo vean los encargados. Los más antiguos van primero.
      </Encabezado>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {reportes.length === 0 ? (
        <Vacio titulo="No hay reportes por revisar">
          <p>Cuando un usuario envíe un reporte, aparecerá aquí.</p>
        </Vacio>
      ) : (
        <ul className="lista">
          {reportes.map((r) => (
            <TarjetaRevision key={r.id} reporte={r} alTerminar={cargar} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TarjetaRevision({ reporte: r, alTerminar }: { reporte: ReporteRevision; alTerminar: () => Promise<void> }) {
  const [duplicados, setDuplicados] = useState<Duplicado[] | null>(null);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState<string>(config.motivosRechazo[0]);
  const [otroMotivo, setOtroMotivo] = useState('');
  const [esFalso, setEsFalso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    rpc<Duplicado[]>('sugerir_duplicados', { p_reporte: r.id })
      .then(setDuplicados)
      .catch(() => setDuplicados([]));
  }, [r.id]);

  const puntos = useMemo(() => [{ id: r.id, lat: r.lat, lng: r.lng, color: COLOR_ESTADO.en_revision }], [r]);

  async function hacer(fn: () => Promise<unknown>) {
    setError(null);
    setOcupado(true);
    try {
      await fn();
      await alTerminar();
    } catch (e) {
      setError(mensajeError(e));
      setOcupado(false);
    }
  }

  const aprobarNuevo = () => hacer(() => rpc('aprobar_reporte', { p_reporte: r.id }));
  const unirACaso = (caso: string) => hacer(() => rpc('aprobar_reporte', { p_reporte: r.id, p_caso: caso }));
  const aprobarJuntos = (otro: string) =>
    hacer(async () => {
      const caso = await rpc<string>('aprobar_reporte', { p_reporte: r.id });
      await rpc('aprobar_reporte', { p_reporte: otro, p_caso: caso });
    });
  const rechazar = () =>
    hacer(() =>
      rpc('rechazar_reporte', {
        p_reporte: r.id,
        p_motivo: motivo === OTRO ? otroMotivo : motivo,
        p_es_falso: esFalso,
      }),
    );

  const casos = (duplicados ?? []).filter((d) => d.tipo === 'caso');
  const otrosReportes = (duplicados ?? []).filter((d) => d.tipo === 'reporte');

  return (
    <li className="tarjeta revision">
      <div className="revision-medios">
        <FotoPrivada bucket="reportes" ruta={r.foto_path} alt={`Foto del reporte: ${ESPECIES[r.especie]}`} />
        <MapaPuntos puntos={puntos} alto={180} />
      </div>
      <div className="tarjeta-cuerpo">
        <div className="tarjeta-titulo">
          <strong>{ESPECIES[r.especie]}</strong>
          <span className="ayuda">enviado {haceCuanto(r.creado_en)}</span>
        </div>
        <div>{r.referencia}</div>
        {r.descripcion && <div className="ayuda">{r.descripcion}</div>}
        <div className="ayuda">
          {r.canton?.nombre}, {r.canton?.provincia?.nombre} · foto del {fecha(r.capturado_en)}
          {r.precision_m != null && ` · GPS ± ${metros(r.precision_m)}`}
        </div>
        <div className="autor">
          <span>
            {r.autor?.nombre || 'Cuenta eliminada'}
            {r.autor?.telefono && (
              <>
                {' · '}
                <span className="seleccionable">{telefonoLegible(r.autor.telefono)}</span>
              </>
            )}
          </span>
          {r.autor && r.autor.advertencias > 0 && (
            <span className="chip chip-alerta">
              {r.autor.advertencias} {r.autor.advertencias === 1 ? 'advertencia' : 'advertencias'}
            </span>
          )}
        </div>

        {error && <Aviso tipo="error">{error}</Aviso>}

        {duplicados === null ? (
          <p className="ayuda">Buscando posibles duplicados…</p>
        ) : (
          (casos.length > 0 || otrosReportes.length > 0) && (
            <div className="duplicados">
              <strong>Posible mismo animal</strong>
              <ul>
                {casos.map((d) => (
                  <li key={d.id}>
                    <span>
                      Caso {d.estado === 'en_accion' ? 'en acción' : 'pendiente'} a {metros(d.distancia_m)} ·{' '}
                      <Link to={`/casos/${d.id}`}>ver</Link>
                    </span>
                    <button type="button" className="boton" disabled={ocupado} onClick={() => void unirACaso(d.id)}>
                      Aprobar y unir a este caso
                    </button>
                  </li>
                ))}
                {otrosReportes.map((d) => (
                  <li key={d.id}>
                    <span>
                      Otro reporte en revisión a {metros(d.distancia_m)}, {Math.round(d.horas)} h de diferencia
                    </span>
                    <button type="button" className="boton" disabled={ocupado} onClick={() => void aprobarJuntos(d.id)}>
                      Aprobar ambos como un caso
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        )}

        {!rechazando ? (
          <div className="acciones">
            <button type="button" className="boton boton-principal" disabled={ocupado} onClick={() => void aprobarNuevo()}>
              {casos.length ? 'Aprobar como caso nuevo' : 'Aprobar'}
            </button>
            <button type="button" className="boton" disabled={ocupado} onClick={() => setRechazando(true)}>
              Rechazar
            </button>
          </div>
        ) : (
          <div className="panel">
            <div className="campo">
              <label htmlFor={`motivo-${r.id}`}>Motivo del rechazo (lo verá el usuario)</label>
              <select id={`motivo-${r.id}`} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                {config.motivosRechazo.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                <option value={OTRO}>Otro…</option>
              </select>
            </div>
            {motivo === OTRO && (
              <div className="campo">
                <label htmlFor={`otro-${r.id}`}>Escribe el motivo</label>
                <input id={`otro-${r.id}`} value={otroMotivo} onChange={(e) => setOtroMotivo(e.target.value)} maxLength={300} />
              </div>
            )}
            <label className="marcar">
              <input type="checkbox" checked={esFalso} onChange={(e) => setEsFalso(e.target.checked)} />
              Es un reporte falso o malintencionado (suma una advertencia al usuario)
            </label>
            <div className="acciones">
              <button type="button" className="boton boton-peligro" disabled={ocupado} onClick={() => void rechazar()}>
                Rechazar reporte
              </button>
              <button type="button" className="boton boton-texto" onClick={() => setRechazando(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
