import { useEffect, useRef, useState } from 'react';
import { capturarCuadro } from '../lib/foto';

interface Props {
  /** Texto del botón de captura */
  etiqueta?: string;
  /** El botón se deshabilita mientras esto sea false (por ejemplo, sin GPS) */
  habilitado?: boolean;
  alCapturar: (foto: Blob) => void;
}

/**
 * Cámara en vivo dentro de la app. No se ofrece elegir de la galería:
 * así la foto corresponde al momento y lugar del reporte.
 */
export function Camara({ etiqueta = 'Tomar foto', habilitado = true, alCapturar }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [lista, setLista] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturando, setCapturando] = useState(false);

  useEffect(() => {
    let flujo: MediaStream | null = null;
    let cancelado = false;

    async function abrir() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no permite usar la cámara. Abre la app en Chrome o Safari actualizados.');
        return;
      }
      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelado) {
          flujo.getTracks().forEach((t) => t.stop());
          return;
        }
        if (video.current) {
          video.current.srcObject = flujo;
          await video.current.play().catch(() => undefined);
        }
      } catch (e) {
        const nombre = e instanceof DOMException ? e.name : '';
        setError(
          nombre === 'NotAllowedError'
            ? 'Necesitamos permiso para usar la cámara. Actívalo en los ajustes del navegador para esta app y vuelve a abrir esta pantalla.'
            : nombre === 'NotFoundError'
              ? 'No encontramos una cámara en este dispositivo.'
              : 'No se pudo abrir la cámara. Cierra otras apps que la estén usando e intenta de nuevo.',
        );
      }
    }

    void abrir();
    return () => {
      cancelado = true;
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function capturar() {
    if (!video.current) return;
    setCapturando(true);
    try {
      alCapturar(await capturarCuadro(video.current));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo tomar la foto.');
    } finally {
      setCapturando(false);
    }
  }

  if (error) return <div className="aviso aviso-error" role="alert">{error}</div>;

  return (
    <div className="camara">
      <video
        ref={video}
        playsInline
        muted
        autoPlay
        onLoadedMetadata={() => setLista(true)}
        aria-label="Vista de la cámara"
      />
      <button
        type="button"
        className="boton boton-principal boton-captura"
        disabled={!lista || !habilitado || capturando}
        onClick={capturar}
      >
        {capturando ? 'Guardando…' : etiqueta}
      </button>
    </div>
  );
}
