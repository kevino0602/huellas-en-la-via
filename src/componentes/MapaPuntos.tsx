import { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import { latLngBounds } from 'leaflet';
import type { ReactNode } from 'react';
import { config } from '../config';

export interface Punto {
  id: string;
  lat: number;
  lng: number;
  color: string;
  contenido?: ReactNode;
}

function Encuadre({ puntos }: { puntos: Punto[] }) {
  const mapa = useMap();
  // Solo se reencuadra cuando cambian las coordenadas, no en cada render
  const clave = puntos.map((p) => `${p.lat},${p.lng}`).join('|');
  useEffect(() => {
    const coords = clave ? clave.split('|').map((c) => c.split(',').map(Number) as [number, number]) : [];
    if (coords.length === 1) {
      mapa.setView(coords[0], 16);
    } else if (coords.length > 1) {
      mapa.fitBounds(latLngBounds(coords), { padding: [30, 30] });
    }
  }, [mapa, clave]);
  return null;
}

export function MapaPuntos({ puntos, alto = 320 }: { puntos: Punto[]; alto?: number }) {
  return (
    <div className="mapa" style={{ height: alto }}>
      <MapContainer center={config.mapa.centroEcuador} zoom={config.mapa.zoomInicial} scrollWheelZoom={false}>
        <TileLayer url={config.mapa.teselas} attribution={config.mapa.atribucion} />
        {puntos.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={9}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: p.color, fillOpacity: 0.95 }}
          >
            {p.contenido && <Popup>{p.contenido}</Popup>}
          </CircleMarker>
        ))}
        <Encuadre puntos={puntos} />
      </MapContainer>
    </div>
  );
}

/** Colores de estado, iguales a los chips (ver estilos.css) */
export const COLOR_ESTADO: Record<string, string> = {
  pendiente: '#C2410C',
  en_accion: '#B88300',
  finalizado: '#2B734A',
  en_revision: '#5B6B7C',
};
