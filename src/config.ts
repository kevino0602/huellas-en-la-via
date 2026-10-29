// =====================================================================
// Configuración de la app (lado del celular).
// Los números de las reglas de negocio (metros para duplicados, límite
// diario, horas para soltar casos...) viven en la tabla
// public.configuracion de la base de datos, no aquí.
// =====================================================================

export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '',

  foto: {
    /** Lado mayor de la foto guardada, en píxeles */
    ladoMaximoPx: 1280,
    /** Calidad JPEG (0 a 1). 0.8 deja fotos de ~150-300 KB */
    calidadJpeg: 0.8,
  },

  gps: {
    /** Por encima de esta precisión (metros) se avisa que la ubicación es imprecisa */
    precisionRecomendadaM: 50,
  },

  mapa: {
    centroEcuador: [-1.6, -78.5] as [number, number],
    zoomInicial: 7,
    teselas: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    atribucion: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },

  /** Segundos que dura un enlace firmado para ver una foto privada */
  segundosEnlaceFoto: 600,

  contrasena: { longitudMinima: 10 },

  motivosRechazo: [
    'No se ve un animal en la foto',
    'La ubicación no coincide con la foto',
    'Foto repetida o tomada de internet',
    'El animal está vivo: no corresponde a esta app',
  ],
} as const;
