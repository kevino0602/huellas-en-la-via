import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

export const configuracionCompleta = Boolean(config.supabaseUrl && config.supabaseAnonKey);

export const supabase = createClient(
  config.supabaseUrl || 'https://falta-configurar.supabase.co',
  config.supabaseAnonKey || 'falta-configurar',
  {
    auth: {
      // "implicit" es necesario para que funcionen los enlaces de invitación
      // que el administrador envía a los encargados.
      flowType: 'implicit',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

/** Traduce los errores de Supabase a mensajes para la persona */
export function mensajeError(e: unknown): string {
  const texto =
    typeof e === 'string'
      ? e
      : e && typeof e === 'object' && 'message' in e
        ? String((e as { message: unknown }).message)
        : 'Ocurrió un error inesperado.';

  const traducciones: [RegExp, string][] = [
    [/Invalid login credentials/i, 'Correo o contraseña incorrectos.'],
    [/Email not confirmed/i, 'Confirma tu correo con el enlace que te enviamos antes de entrar.'],
    [/User already registered/i, 'Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.'],
    [/Password should be at least/i, 'La contraseña es muy corta.'],
    [/(weak|pwned|leaked) password/i, 'Esa contraseña es muy común o apareció en filtraciones. Elige otra.'],
    [/rate limit|too many requests/i, 'Demasiados intentos. Espera unos minutos y vuelve a intentar.'],
    [/captcha/i, 'Completa la verificación de seguridad e intenta de nuevo.'],
    [/Invalid TOTP code|invalid.*code/i, 'El código no es correcto o ya caducó. Usa el que aparece ahora en tu app.'],
    [/permission denied|row-level security/i, 'No tienes permiso para hacer esto.'],
    [/Failed to fetch|NetworkError|Load failed/i, 'Sin conexión. Revisa tu señal e intenta de nuevo.'],
    [/JWT expired/i, 'Tu sesión caducó. Vuelve a iniciar sesión.'],
  ];
  for (const [patron, mensaje] of traducciones) {
    if (patron.test(texto)) return mensaje;
  }
  return texto;
}

/** Llama a una función de la base (RPC) y lanza el error si falla */
export async function rpc<T = unknown>(nombre: string, parametros?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nombre, parametros);
  if (error) throw error;
  return data as T;
}
