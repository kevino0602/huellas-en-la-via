// =====================================================================
// Elimina la cuenta de quien llama (derecho de eliminación, LOPDP).
// - Borra sus reportes que aún estaban en revisión y sus fotos.
// - Los reportes aprobados se conservan sin nombre (usuario_id queda en
//   null por la regla "on delete set null"), porque son parte de casos.
// - Administradores y encargados primero deben pasar a rol usuario.
//
// Desplegar:  npx supabase functions deploy eliminar-cuenta
// =====================================================================
import { cabecerasCors, clienteDeServicio, clienteDeUsuario, responder } from '../_compartido/comun.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabecerasCors(req) });
  if (req.method !== 'POST') return responder(req, { error: 'Método no permitido.' }, 405);

  const { data: sesion, error: errorSesion } = await clienteDeUsuario(req).auth.getUser();
  if (errorSesion || !sesion.user) return responder(req, { error: 'Inicia sesión de nuevo.' }, 401);
  const uid = sesion.user.id;

  let confirmacion = '';
  try {
    confirmacion = ((await req.json()) as { confirmacion?: string }).confirmacion ?? '';
  } catch {
    /* sin cuerpo */
  }
  if (confirmacion !== 'ELIMINAR') return responder(req, { error: 'Falta la confirmación.' }, 400);

  const servicio = clienteDeServicio();

  const { data: perfil } = await servicio.from('perfiles').select('rol').eq('id', uid).single();
  if (perfil && perfil.rol !== 'usuario') {
    return responder(req, { error: 'Primero otro administrador debe cambiar tu rol a usuario.' }, 409);
  }

  // Reportes en revisión: se borran junto con sus fotos
  const { data: enRevision } = await servicio
    .from('reportes')
    .select('id, foto_path')
    .eq('usuario_id', uid)
    .eq('estado', 'en_revision');
  if (enRevision?.length) {
    await servicio.storage.from('reportes').remove(enRevision.map((r) => r.foto_path));
    await servicio.from('reportes').delete().in('id', enRevision.map((r) => r.id));
  }

  const { error } = await servicio.auth.admin.deleteUser(uid);
  if (error) return responder(req, { error: 'No se pudo eliminar la cuenta. Intenta más tarde.' }, 500);

  return responder(req, { ok: true });
});
