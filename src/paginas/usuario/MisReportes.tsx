import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { FotoPrivada } from '../../componentes/FotoPrivada';
import { Aviso, Cargando, ChipCaso, ChipRevision, Encabezado, Vacio } from '../../componentes/ui';
import {
  descartarPendiente,
  enviarPendientes,
  eventosCola,
  listarPendientes,
  type ReportePendiente,
} from '../../lib/colaOffline';
import { fecha } from '../../lib/formato';
import { mensajeError, supabase } from '../../lib/supabase';
import { ESPECIES, type CantonConProvincia, type EstadoCaso, type Reporte } from '../../lib/tipos';

type MiReporte = Reporte & { canton: CantonConProvincia | null; caso: { estado: EstadoCaso } | null };

const AVANCE: Record<EstadoCaso, string> = {
  pendiente: 'Aprobado. Esperando que un encargado lo tome.',
  en_accion: 'Un encargado está en camino.',
  finalizado: 'El animal fue levantado. Gracias por reportar.',
  unido: 'Se unió a otro reporte del mismo animal.',
};

export function MisReportes() {
  const { perfil } = useAuth();
  const [reportes, setReportes] = useState<MiReporte[] | null>(null);
  const [pendientes, setPendientes] = useState<ReportePendiente[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!perfil) return;
    setPendientes(await listarPendientes(perfil.id));
    if (!navigator.onLine) {
      setReportes((r) => r ?? []);
      return;
    }
    const { data, error } = await supabase
      .from('reportes')
      .select('*, canton:cantones!reportes_canton_id_fkey(nombre, provincia:provincias(nombre)), caso:casos!reportes_caso_id_fkey(estado)')
      .eq('usuario_id', perfil.id)
      .order('creado_en', { ascending: false })
      .limit(100);
    if (error) setError(mensajeError(error));
    setReportes((data as MiReporte[] | null) ?? []);
  }, [perfil]);

  useEffect(() => {
    void cargar();
    const alCambiar = () => void cargar();
    eventosCola.addEventListener('cambio', alCambiar);
    return () => eventosCola.removeEventListener('cambio', alCambiar);
  }, [cargar]);

  async function borrar(r: MiReporte) {
    setError(null);
    const { error } = await supabase.from('reportes').delete().eq('id', r.id).eq('estado', 'en_revision');
    if (error) return setError(mensajeError(error));
    await supabase.storage.from('reportes').remove([r.foto_path]);
    await cargar();
  }

  if (!reportes) return <Cargando />;

  return (
    <div className="pagina">
      <Encabezado titulo="Mis reportes">Aquí ves en qué va cada animal que reportaste.</Encabezado>
      {error && <Aviso tipo="error">{error}</Aviso>}

      {pendientes.length > 0 && (
        <section className="seccion">
          <h2>Guardados sin señal</h2>
          <ul className="lista">
            {pendientes.map((p) => (
              <li key={p.id} className="tarjeta">
                <div>
                  <strong>{ESPECIES[p.datos.especie]}</strong> · {p.datos.referencia}
                  <div className="ayuda">Foto del {fecha(p.datos.capturado_en)}</div>
                  {p.ultimoError && <Aviso tipo="error">{mensajeError(p.ultimoError)}</Aviso>}
                </div>
                <div className="acciones">
                  <button type="button" className="boton" onClick={() => perfil && void enviarPendientes(perfil.id)}>
                    Reintentar
                  </button>
                  <button type="button" className="boton boton-texto" onClick={() => void descartarPendiente(p.id)}>
                    Descartar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reportes.length === 0 && pendientes.length === 0 ? (
        <Vacio titulo="Todavía no has reportado">
          <p>Cuando encuentres un animal muerto en la calle, repórtalo con una foto y tu ubicación.</p>
          <Link to="/reportar" className="boton boton-principal">
            Reportar ahora
          </Link>
        </Vacio>
      ) : (
        <ul className="lista">
          {reportes.map((r) => (
            <li key={r.id} className="tarjeta tarjeta-con-foto">
              <FotoPrivada bucket="reportes" ruta={r.foto_path} alt={`Foto del reporte de ${ESPECIES[r.especie]}`} />
              <div className="tarjeta-cuerpo">
                <div className="tarjeta-titulo">
                  <strong>{ESPECIES[r.especie]}</strong>
                  {r.estado === 'aprobado' && r.caso ? <ChipCaso estado={r.caso.estado} /> : <ChipRevision estado={r.estado} />}
                </div>
                <div>{r.referencia}</div>
                <div className="ayuda">
                  {r.canton?.nombre}, {r.canton?.provincia?.nombre} · {fecha(r.creado_en)}
                </div>
                {r.estado === 'en_revision' && <p className="ayuda">Un administrador está revisando que el reporte sea real.</p>}
                {r.estado === 'rechazado' && <p className="texto-error">No se aprobó: {r.motivo_rechazo}</p>}
                {r.estado === 'aprobado' && r.caso && <p className="ayuda">{AVANCE[r.caso.estado]}</p>}
                {r.estado === 'en_revision' && (
                  <div className="acciones">
                    <button type="button" className="boton boton-texto" onClick={() => void borrar(r)}>
                      Borrar reporte
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
