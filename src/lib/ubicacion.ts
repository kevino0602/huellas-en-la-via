export interface Posicion {
  lat: number;
  lng: number;
  /** Radio de error en metros que reporta el GPS */
  precision: number;
  /** Momento de la lectura (ms desde 1970) */
  momento: number;
}

/**
 * Sigue la posición GPS mientras la pantalla está abierta, para tener una
 * lectura fresca justo cuando se toma la foto. Devuelve la función para
 * dejar de seguirla.
 */
export function seguirPosicion(
  alCambiar: (p: Posicion) => void,
  alFallar: (mensaje: string) => void,
): () => void {
  if (!('geolocation' in navigator)) {
    alFallar('Este celular no permite obtener la ubicación.');
    return () => undefined;
  }
  const id = navigator.geolocation.watchPosition(
    (p) =>
      alCambiar({
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        precision: p.coords.accuracy,
        momento: p.timestamp,
      }),
    (e) => alFallar(mensajeErrorGps(e)),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

export function mensajeErrorGps(e: GeolocationPositionError): string {
  switch (e.code) {
    case e.PERMISSION_DENIED:
      return 'Necesitamos tu ubicación para saber dónde está el animal. Activa el permiso de ubicación para esta app en los ajustes del navegador y vuelve a abrir esta pantalla.';
    case e.POSITION_UNAVAILABLE:
      return 'No se pudo obtener la ubicación. Activa el GPS del celular y sal a un lugar abierto.';
    case e.TIMEOUT:
      return 'El GPS está tardando. Seguimos intentando…';
    default:
      return 'No se pudo obtener la ubicación.';
  }
}

export function enlaceComoLlegar(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
