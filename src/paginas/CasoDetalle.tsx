import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { Camara } from '../componentes/Camara';
import { FotoPrivada } from '../componentes/FotoPrivada';
import { COLOR_ESTADO, MapaPuntos } from '../componentes/MapaPuntos';
import { Aviso, Cargando, ChipCaso, Encabezado } from '../componentes/ui';
import { lugarCaso, SELECT_CASO, useConfiguracion, type CasoDetallado } from '../lib/consultas';
import { fecha, haceCuanto, metros } from '../lib/formato';
import { mensajeError, rpc, supabase } from '../lib/supabase';
import {
  ACCIONES_HISTORIAL,
  ESPECIES,
  ESTADOS_CASO,
  MOTIVOS_SOLTAR,
  type Especie,
  type EstadoCaso,
  type Historial,
  type MotivoSoltar,
  type Persona,
} from '../lib/tipos';
import { enlaceComoLlegar } from '../lib/ubicacion';
import { horasRestantes } from './encargado/Casos';

interface Cercano {
  id: string;
  distancia_m: number;
  estado: EstadoCaso;
  especie: Especie;
  creado_en: string;
}

type Panel = null | 'soltar' | 'finalizar' | 'asignar' | 'reabrir';

export function CasoDetalle() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { perfil } = useAuth();
  const configuracion = useConfiguracion();
  const esAdmin = perfil?.rol === 'admin';
  const esEncargado = perfil?.rol === 'encargado';

  const [caso, setCaso] = useState<CasoDetallado | null | undefined>(undefined);
  const [historial, setHistorial] = useState<Historial[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [encargados, setEncargados] = useState<Persona[]>([]);
  const [cercanos, setCercanos] = useState<Cercano[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Formularios
  const [motivoSoltar, setMotivoSoltar] = useState<MotivoSoltar>('jurisdiccion');
  const [nota, setNota] = useState('');
  const [evidencia, setEvidencia] = useState<Blob | null>(null);
  const [encargadoElegido, setEncargadoElegido] = useState('');
  const [motivoReabrir, setMotivoReabrir] = useState('');

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('casos').select(SELECT_CASO).eq('id', id).maybeSingle();
    if (error) setError(mensajeError(error));
    const c = (data as CasoDetallado | null) ?? null;
    setCaso(c);
    if (!c) return;

    const h = await supabase.from('caso_historial').select('*').eq('caso_id', id).order('creado_en');
    const filas = (h.data as Historial[] | null) ?? [];
    setHistorial(filas);

    if (esAdmin) {
      const ids = [...new Set(filas.map((f) => f.actor_id).filter((x): x is string => Boolean(x)))];
      if (ids.length) {
        const p = await supabase.from('perfiles').select('id, nombre').in('id', ids);
        setNombres(Object.fromEntries(((p.data as { id: string; nombre: string }[] | null) ?? []).map((x) => [x.id, x.nombre])));
      }
      setEncargados(await rpc<Persona[]>('buscar_personas', { p_texto: '', p_rol: 'encargado' }).catch(() => []));
      setCercanos(c.estado === 'pendiente' ? await rpc<Cercano[]>('casos_cercanos', { p_caso: id }).catch(() => []) : []);
    }
  }, [id, esAdmin]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const puntos = useMemo(() => {
    if (!caso) return [];
    return [
      { id: caso.id, lat: caso.lat, lng: caso.lng, color: COLOR_ESTADO[caso.estado] ?? '#666', contenido: 'Ubicación del caso' },
      ...caso.reportes
        .filter((r) => Math.abs(r.lat - caso.lat) > 1e-6 || Math.abs(r.lng - caso.lng) > 1e-6)
        .map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, color: COLOR_ESTADO.en_revision, contenido: 'Otro reporte' })),
    ];
  }, [caso]);

  const urlEvidencia = useMemo(() => (evidencia ? URL.createObjectURL(evidencia) : null), [evidencia]);
  useEffect(() => {
    return () => {
      if (urlEvidencia) URL.revokeObjectURL(urlEvidencia);
    };
  }, [urlEvidencia]);

  // Encargados que cubren el cantón del caso, primero
  const encargadosOrdenados = useMemo(() => {
    if (!caso) return encargados;
    return [...encargados].sort(
      (a, b) => Number(b.zonas.includes(caso.canton_id)) - Number(a.zonas.includes(caso.canton_id)),
    );
  }, [encargados, caso]);

  async function accion(fn: () => Promise<unknown>, despues?: () => void) {
    setError(null);
    setOcupado(true);
    try {
      await fn();
      setPanel(null);
      setNota('');
      setEvidencia(null);
      if (despues) despues();
      else await cargar();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  }

  const tomar = () => accion(() => rpc('tomar_caso', { p_caso: id }));

  const soltar = (e: FormEvent) => {
    e.preventDefault();
    void accion(
      () => rpc('soltar_caso', { p_caso: id, p_motivo: motivoSoltar, p_nota: nota }),
      () => navegar('/casos'),
    );
  };

  const finalizar = (e: FormEvent) => {
    e.preventDefault();
    if (!evidencia || !perfil) return;
    void accion(async () => {
      const ruta = `${perfil.id}/${id}-${Date.now()}.jpg`;
      const subida = await supabase.storage.from('evidencias').upload(ruta, evidencia, { contentType: 'image/jpeg' });
      if (subida.error) throw subida.error;
      await rpc('finalizar_caso', { p_caso: id, p_foto: ruta, p_nota: nota });
    });
  };

  const asignar = (e: FormEvent) => {
    e.preventDefault();
    if (!encargadoElegido) return setError('Elige un encargado.');
    void accion(() => rpc('asignar_caso', { p_caso: id, p_encargado: encargadoElegido }));
  };

  const reabrir = (e: FormEvent) => {
    e.preventDefault();
    void accion(() => rpc('reabrir_caso', { p_caso: id, p_motivo: motivoReabrir }));
  };

  const unirA = (principal: string) =>
    accion(
      () => rpc('unir_casos', { p_principal: principal, p_secundario: id }),
      () => navegar(`/casos/${principal}`, { replace: true }),
    );

  if (caso === undefined) return <Cargando />;
  if (caso === null)
    return (
      <div className="pagina">
        <Encabezado titulo="Caso no disponible" />
        <Aviso tipo="info">Este caso no existe o ya no está en tu zona.</Aviso>
        <Link to={esAdmin ? '/admin/casos' : '/casos'} className="boton">
          Volver a casos
        </Link>
      </div>
    );

  const esMio = caso.encargado_id === perfil?.id;
  const restantes = configuracion ? horasRestantes(caso.tomado_en, configuracion.horas_auto_soltar) : null;

  function nombreActor(actor: string | null): string {
    if (!actor) return 'Sistema';
    if (actor === perfil?.id) return 'Tú';
    return nombres[actor] || (esAdmin ? 'Persona' : 'Otra persona');
  }

  return (
    <div className="pagina">
      <Encabezado titulo={`${ESPECIES[caso.especie]} · ${lugarCaso(caso)}`}>
        <ChipCaso estado={caso.estado} /> Aprobado {haceCuanto(caso.creado_en)}
      </Encabezado>

      {error && <Aviso tipo="error">{error}</Aviso>}

      {caso.estado === 'unido' && caso.unido_a && (
        <Aviso tipo="info">
          Este caso se unió a otro del mismo animal. <Link to={`/casos/${caso.unido_a}`}>Ver el caso principal</Link>
        </Aviso>
      )}

      {caso.estado === 'en_accion' && (
        <Aviso tipo={esMio ? 'alerta' : 'info'}>
          {esMio ? 'Tienes este caso en acción.' : `En acción por ${caso.encargado?.nombre || 'otro encargado'}.`}{' '}
          {restantes != null && `Se libera automáticamente en ${restantes} h si no se finaliza.`}
        </Aviso>
      )}

      <MapaPuntos puntos={puntos} alto={260} />
      <div className="acciones">
        <a className="boton" href={enlaceComoLlegar(caso.lat, caso.lng)} target="_blank" rel="noopener noreferrer">
          Cómo llegar
        </a>
        {esEncargado && caso.estado === 'pendiente' && (
          <button type="button" className="boton boton-principal" disabled={ocupado} onClick={() => void tomar()}>
            Tomar caso
          </button>
        )}
        {esEncargado && caso.estado === 'en_accion' && esMio && (
          <>
            <button type="button" className="boton boton-principal" onClick={() => setPanel('finalizar')}>
              Finalizar
            </button>
            <button type="button" className="boton" onClick={() => setPanel('soltar')}>
              Soltar caso
            </button>
          </>
        )}
        {esAdmin && (caso.estado === 'pendiente' || caso.estado === 'en_accion') && (
          <button type="button" className="boton" onClick={() => setPanel('asignar')}>
            {caso.estado === 'pendiente' ? 'Asignar a un encargado' : 'Reasignar'}
          </button>
        )}
        {esAdmin && caso.estado === 'finalizado' && (
          <button type="button" className="boton" onClick={() => setPanel('reabrir')}>
            Reabrir caso
          </button>
        )}
      </div>

      {panel === 'soltar' && (
        <form className="panel" onSubmit={soltar}>
          <h2>Soltar el caso</h2>
          <p className="ayuda">El caso vuelve a pendiente para que lo tome otra persona.</p>
          <fieldset className="campo">
            <legend>Motivo</legend>
            {(Object.keys(MOTIVOS_SOLTAR) as MotivoSoltar[]).map((m) => (
              <label key={m} className="marcar">
                <input type="radio" name="motivo" checked={motivoSoltar === m} onChange={() => setMotivoSoltar(m)} />
                {MOTIVOS_SOLTAR[m]}
              </label>
            ))}
          </fieldset>
          {motivoSoltar === 'jurisdiccion' && (
            <p className="ayuda">Este caso ya no te volverá a aparecer.</p>
          )}
          <div className="campo">
            <label htmlFor="nota-soltar">Nota {motivoSoltar === 'otro' ? '' : '(opcional)'}</label>
            <textarea id="nota-soltar" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
          </div>
          <div className="acciones">
            <button type="submit" className="boton boton-principal" disabled={ocupado}>
              Soltar caso
            </button>
            <button type="button" className="boton boton-texto" onClick={() => setPanel(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {panel === 'finalizar' && (
        <form className="panel" onSubmit={finalizar}>
          <h2>Finalizar el caso</h2>
          <p className="ayuda">Toma una foto del lugar ya despejado como prueba.</p>
          {urlEvidencia ? (
            <div className="vista-previa">
              <img src={urlEvidencia} alt="Foto de evidencia" />
              <button type="button" className="boton" onClick={() => setEvidencia(null)}>
                Tomar otra
              </button>
            </div>
          ) : (
            <Camara etiqueta="Tomar foto de evidencia" alCapturar={setEvidencia} />
          )}
          <div className="campo">
            <label htmlFor="nota-final">Nota (opcional)</label>
            <textarea
              id="nota-final"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={500}
              placeholder="Por ejemplo: entregado al camión del GAD"
            />
          </div>
          <div className="acciones">
            <button type="submit" className="boton boton-principal" disabled={!evidencia || ocupado}>
              {ocupado ? 'Guardando…' : 'Finalizar caso'}
            </button>
            <button type="button" className="boton boton-texto" onClick={() => setPanel(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {panel === 'asignar' && (
        <form className="panel" onSubmit={asignar}>
          <h2>Asignar a un encargado</h2>
          <div className="campo">
            <label htmlFor="encargado">Encargado</label>
            <select id="encargado" value={encargadoElegido} onChange={(e) => setEncargadoElegido(e.target.value)}>
              <option value="">Elige un encargado</option>
              {encargadosOrdenados.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre || p.correo}
                  {p.zonas.includes(caso.canton_id) ? ' · cubre este cantón' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="acciones">
            <button type="submit" className="boton boton-principal" disabled={ocupado}>
              Asignar
            </button>
            <button type="button" className="boton boton-texto" onClick={() => setPanel(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {panel === 'reabrir' && (
        <form className="panel" onSubmit={reabrir}>
          <h2>Reabrir el caso</h2>
          <p className="ayuda">Vuelve a pendiente. La evidencia anterior queda en el historial.</p>
          <div className="campo">
            <label htmlFor="motivo-reabrir">Motivo</label>
            <textarea id="motivo-reabrir" value={motivoReabrir} onChange={(e) => setMotivoReabrir(e.target.value)} maxLength={300} />
          </div>
          <div className="acciones">
            <button type="submit" className="boton boton-principal" disabled={ocupado}>
              Reabrir
            </button>
            <button type="button" className="boton boton-texto" onClick={() => setPanel(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {esAdmin && cercanos.length > 0 && (
        <section className="seccion">
          <h2>Casos cercanos</h2>
          <p className="ayuda">Si son el mismo animal, une este caso al otro para que no vayan dos veces.</p>
          <ul className="lista">
            {cercanos.map((c) => (
              <li key={c.id} className="tarjeta fila-tarjeta">
                <div>
                  <strong>{ESPECIES[c.especie]}</strong> a {metros(c.distancia_m)} · {ESTADOS_CASO[c.estado]} ·{' '}
                  {haceCuanto(c.creado_en)} · <Link to={`/casos/${c.id}`}>ver</Link>
                </div>
                <button type="button" className="boton" disabled={ocupado} onClick={() => void unirA(c.id)}>
                  Unir a ese caso
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {caso.estado === 'finalizado' && caso.foto_evidencia && (
        <section className="seccion">
          <h2>Evidencia</h2>
          <FotoPrivada bucket="evidencias" ruta={caso.foto_evidencia} alt="Foto de evidencia del caso" difuminar={false} />
          <p className="ayuda">
            Finalizado {fecha(caso.finalizado_en)} {caso.encargado?.nombre ? `por ${caso.encargado.nombre}` : ''}
          </p>
          {caso.nota_final && <p>{caso.nota_final}</p>}
        </section>
      )}

      <section className="seccion">
        <h2>{caso.reportes.length === 1 ? 'Reporte' : `${caso.reportes.length} reportes`}</h2>
        <ul className="lista">
          {caso.reportes.map((r) => (
            <li key={r.id} className="tarjeta tarjeta-con-foto">
              <FotoPrivada bucket="reportes" ruta={r.foto_path} alt="Foto del reporte" />
              <div className="tarjeta-cuerpo">
                <div>{r.referencia}</div>
                {r.descripcion && <div className="ayuda">{r.descripcion}</div>}
                <div className="ayuda">
                  Foto del {fecha(r.capturado_en)}
                  {r.precision_m != null && ` · GPS ± ${metros(r.precision_m)}`}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {historial.length > 0 && (
        <section className="seccion">
          <h2>Historial</h2>
          <ol className="historial">
            {historial.map((h) => (
              <li key={h.id}>
                <span className="historial-fecha">{fecha(h.creado_en)}</span>
                <span>
                  <strong>{ACCIONES_HISTORIAL[h.accion] ?? h.accion}</strong> · {nombreActor(h.actor_id)}
                  {h.motivo && ` · ${MOTIVOS_SOLTAR[h.motivo as MotivoSoltar] ?? h.motivo}`}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
