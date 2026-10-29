import { useEffect, useState } from 'react';
import { config } from '../config';
import { supabase } from '../lib/supabase';

// Las fotos están en buckets privados: se piden enlaces firmados que caducan.
const cache = new Map<string, { url: string; vence: number }>();

async function enlaceFirmado(bucket: string, ruta: string): Promise<string> {
  const clave = `${bucket}/${ruta}`;
  const guardado = cache.get(clave);
  if (guardado && guardado.vence > Date.now() + 30_000) return guardado.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(ruta, config.segundosEnlaceFoto);
  if (error || !data) throw error ?? new Error('Sin enlace');
  cache.set(clave, { url: data.signedUrl, vence: Date.now() + config.segundosEnlaceFoto * 1000 });
  return data.signedUrl;
}

interface Props {
  bucket: 'reportes' | 'evidencias';
  ruta: string;
  alt: string;
  /** Las fotos de animales muertos se muestran difuminadas hasta tocarlas */
  difuminar?: boolean;
}

export function FotoPrivada({ bucket, ruta, alt, difuminar = true }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);
  const [visible, setVisible] = useState(!difuminar);

  useEffect(() => {
    let vivo = true;
    enlaceFirmado(bucket, ruta)
      .then((u) => vivo && setUrl(u))
      .catch(() => vivo && setFallo(true));
    return () => {
      vivo = false;
    };
  }, [bucket, ruta]);

  if (fallo) return <div className="foto foto-vacia">No se pudo cargar la foto</div>;
  if (!url) return <div className="foto foto-vacia">Cargando foto…</div>;

  return (
    <div className={`foto ${visible ? '' : 'foto-oculta'}`}>
      <img src={url} alt={alt} loading="lazy" />
      {!visible && (
        <button type="button" className="foto-revelar" onClick={() => setVisible(true)}>
          Ver foto
        </button>
      )}
    </div>
  );
}
