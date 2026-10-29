// Utilidades compartidas por las Edge Functions (Deno).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Dominio de la app permitido para llamar a las funciones.
// Configúralo con: npx supabase secrets set APP_URL=https://tu-dominio
const APP_URL = Deno.env.get('APP_URL') ?? '';

export function cabecerasCors(req: Request): Record<string, string> {
  const origen = req.headers.get('Origin') ?? '';
  const permitido =
    !APP_URL || origen === APP_URL || origen.startsWith('http://localhost:') ? origen || '*' : APP_URL;
  return {
    'Access-Control-Allow-Origin': permitido,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function responder(req: Request, cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...cabecerasCors(req), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Cliente que actúa como la persona que llama (respeta RLS) */
export function clienteDeUsuario(req: Request): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/** Cliente con la clave de servicio (salta RLS). Solo dentro de funciones. */
export function clienteDeServicio(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export { APP_URL };
