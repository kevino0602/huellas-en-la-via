const fechaCorta = new Intl.DateTimeFormat('es-EC', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function fecha(iso: string | null | undefined): string {
  if (!iso) return '';
  return fechaCorta.format(new Date(iso));
}

export function haceCuanto(iso: string | null | undefined): string {
  if (!iso) return '';
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}

export function metros(m: number | null | undefined): string {
  if (m == null) return '';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/**
 * Convierte un teléfono ecuatoriano a formato internacional.
 * 0987654321 → +593987654321 · 593987654321 → +593987654321
 * Devuelve null si no parece válido.
 */
export function normalizarTelefono(entrada: string): string | null {
  const limpio = entrada.replace(/[\s\-().]/g, '');
  let e164: string;
  if (/^0\d{9}$/.test(limpio)) e164 = '+593' + limpio.slice(1);
  else if (/^593\d{9}$/.test(limpio)) e164 = '+' + limpio;
  else if (/^\+\d{8,15}$/.test(limpio)) e164 = limpio;
  else return null;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

/** 0987654321 para mostrar números de Ecuador; el resto tal cual */
export function telefonoLegible(e164: string | null | undefined): string {
  if (!e164) return '';
  return e164.startsWith('+593') ? '0' + e164.slice(4) : e164;
}
