import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { Camara } from '../../componentes/Camara';
import { COLOR_ESTADO, MapaPuntos } from '../../componentes/MapaPuntos';
import { SelectorCanton } from '../../componentes/SelectorCanton';
import { Aviso, Cargando, Encabezado } from '../../componentes/ui';
import { config } from '../../config';
import { enviarReporte, esErrorDeRed, guardarPendiente, type ReportePendiente } from '../../lib/colaOffline';
import { metros } from '../../lib/formato';
import { mensajeError, rpc } from '../../lib/supabase';
import { useTerritorio } from '../../lib/territorio';
import { ESPECIES, type Especie } from '../../lib/tipos';
import { seguirPosicion, type Posicion } from '../../lib/ubicacion';

interface EstadoReporte {
  bloqueado: boolean;
  restantes: number;
  limite: number;
}

interface Captura {
  foto: Blob;
  url: string;
  posicion: Posicion;
  momento: Date;
}

export function Reportar() {
  const { perfil } = useAuth();
  const territorio = useTerritorio();
  const [estado, setEstado] = useState<EstadoReporte | null | 'sin-conexion'>(null);
  const [posicion, setPosicion] = useState<Posicion | null>(null);
  const [errorGps, setErrorGps] = useState<string | null>(null);
  const [captura, setCaptura] = useState<Captura | null>(null);
  const [especie, setEspecie] = useState<Especie>('perro');
  const [canton, setCanton] = useState<number | null>(perfil?.canton_id ?? null);
  const [referencia, setReferencia] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<'enviado' | 'sin-senal' | null>(null);

  // ¿Puede reportar hoy?
  useEffect(() => {
    if (!navigator.onLine) {
      setEstado('sin-conexion');
      return;
    }
    rpc<EstadoReporte>('estado_para_reportar')
      .then(setEstado)
      .catch(() => setEstado('sin-conexion'));
  }, []);

  // GPS activo mientras se toma la foto
  useEffect(() => {
    if (captura || resultado) return;
    return seguirPosicion(
      (p) => {
        setPosicion(p);
        setErrorGps(null);
      },
      setErrorGps,
    );
  }, [captura, resultado]);

  // Libera la vista previa de la foto
  useEffect(() => {
    return () => {
      if (captura) URL.revokeObjectURL(captura.url);
    };
  }, [captura]);

  const puntoMapa = useMemo(
    () => (captura ? [{ id: 'aqui', lat: captura.posicion.lat, lng: captura.posicion.lng, color: COLOR_ESTADO.pendiente }] : []),
    [captura],
  );

  function alCapturar(foto: Blob) {
    if (!posicion) return;
    setCaptura({ foto, url: URL.createObjectURL(foto), posicion, momento: new Date() });
  }

  function reiniciar() {
    setCaptura(null);
    setResultado(null);
    setReferencia('');
    setDescripcion('');
    setError(null);
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!captura || !perfil) return;
    setError(null);
    if (!canton) return setError('Elige la provincia y el cantón donde está el animal.');
    if (referencia.trim().length < 5) return setError('Escribe una referencia del lugar (calle, barrio, kilómetro…).');

    const pendiente: ReportePendiente = {
      id: crypto.randomUUID(),
      usuarioId: perfil.id,
      foto: captura.foto,
      guardadoEn: new Date().toISOString(),
      datos: {
        especie,
        descripcion: descripcion.trim().slice(0, 500),
        referencia: referencia.trim().slice(0, 200),
        canton_id: canton,
        lat: captura.posicion.lat,
        lng: captura.posicion.lng,
        precision_m: Math.round(captura.posicion.precision),
        capturado_en: captura.momento.toISOString(),
      },
    };

    setEnviando(true);
    try {
      if (!navigator.onLine) {
        await guardarPendiente(pendiente);
        setResultado('sin-senal');
      } else {
        try {
          await enviarReporte(pendiente);
          setResultado('enviado');
        } catch (err) {
          if (!esErrorDeRed(err)) throw err;
          await guardarPendiente(pendiente);
          setResultado('sin-senal');
        }
      }
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  if (!perfil || !territorio || estado === null) return <Cargando />;

  if (estado !== 'sin-conexion' && estado.bloqueado) {
    return (
      <div className="pagina">
        <Encabezado titulo="Reportar" />
        <Aviso tipo="error">
          Tu cuenta está bloqueada para reportar porque varios reportes fueron marcados como falsos.
        </Aviso>
      </div>
    );
  }
  if (estado !== 'sin-conexion' && estado.restantes === 0 && !resultado) {
    return (
      <div className="pagina">
        <Encabezado titulo="Reportar" />
        <Aviso tipo="alerta">
          Llegaste al límite de {estado.limite} reportes en 24 horas. Podrás reportar de nuevo más tarde.
        </Aviso>
      </div>
    );
  }

  if (resultado) {
    return (
      <div className="pagina">
        <Encabezado titulo={resultado === 'enviado' ? 'Reporte enviado' : 'Guardado sin señal'} />
        <Aviso tipo="exito">
          {resultado === 'enviado'
            ? 'Gracias. Un administrador revisará tu reporte y, al aprobarlo, lo verá el encargado de la zona.'
            : 'No hay señal ahora. Tu reporte quedó guardado en el celular con la ubicación y la hora de la foto, y se enviará solo cuando vuelva la conexión.'}
        </Aviso>
        <div className="acciones">
          <Link to="/mis-reportes" className="boton boton-principal">
            Ver mis reportes
          </Link>
          <button type="button" className="boton" onClick={reiniciar}>
            Reportar otro
          </button>
        </div>
      </div>
    );
  }

  // Paso 1: foto con GPS
  if (!captura) {
    const precisa = posicion && posicion.precision <= config.gps.precisionRecomendadaM;
    return (
      <div className="pagina">
        <Encabezado titulo="Reportar un animal">
          Toma la foto desde una distancia segura. No necesitas tocarlo.
        </Encabezado>
        {estado === 'sin-conexion' && (
          <Aviso tipo="info">Sin conexión: puedes reportar igual y se enviará cuando vuelva la señal.</Aviso>
        )}
        {errorGps ? (
          <Aviso tipo={posicion ? 'alerta' : 'error'}>{errorGps}</Aviso>
        ) : (
          <div className={`gps ${posicion ? (precisa ? 'gps-bien' : 'gps-regular') : ''}`} role="status">
            {!posicion && 'Buscando tu ubicación…'}
            {posicion && precisa && `Ubicación lista (± ${metros(posicion.precision)})`}
            {posicion &&
              !precisa &&
              `Ubicación imprecisa (± ${metros(posicion.precision)}). Si puedes, espera unos segundos o sal a un lugar abierto.`}
          </div>
        )}
        <Camara habilitado={Boolean(posicion)} alCapturar={alCapturar} etiqueta={posicion ? 'Tomar foto' : 'Esperando GPS…'} />
      </div>
    );
  }

  // Paso 2: datos
  return (
    <div className="pagina">
      <Encabezado titulo="Detalles del reporte" />
      <div className="vista-previa">
        <img src={captura.url} alt="Foto tomada" />
        <button type="button" className="boton" onClick={() => setCaptura(null)}>
          Tomar otra
        </button>
      </div>
      <MapaPuntos puntos={puntoMapa} alto={200} />
      <p className="ayuda">Ubicación registrada con una precisión de ± {metros(captura.posicion.precision)}.</p>

      <form onSubmit={enviar} className="formulario" noValidate>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <fieldset className="campo">
          <legend>¿Qué animal es?</legend>
          <div className="opciones">
            {(Object.keys(ESPECIES) as Especie[]).map((k) => (
              <label key={k} className="opcion">
                <input type="radio" name="especie" value={k} checked={especie === k} onChange={() => setEspecie(k)} />
                <span>{ESPECIES[k]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <SelectorCanton territorio={territorio} valor={canton} alCambiar={setCanton} idBase="reporte" />
        <div className="campo">
          <label htmlFor="referencia">Referencia del lugar</label>
          <input
            id="referencia"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            maxLength={200}
            placeholder="Av. Atahualpa y Río Guayllabamba, frente a la gasolinera"
          />
        </div>
        <div className="campo">
          <label htmlFor="descripcion">Descripción (opcional)</label>
          <textarea
            id="descripcion"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            maxLength={500}
            placeholder="Color, tamaño, si tenía collar, si está en la calzada o en la vereda"
          />
        </div>
        <button type="submit" className="boton boton-principal" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar reporte'}
        </button>
      </form>
    </div>
  );
}
