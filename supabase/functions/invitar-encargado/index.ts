// =====================================================================
// Invita a un encargado por correo y le asigna sus cantones.
// Solo un administrador con verificación en dos pasos puede llamarla:
// se comprueba con public.es_admin() usando el token de quien llama.
//
// Desplegar:  npx supabase functions deploy invitar-encargado
// =====================================================================
import { APP_URL, cabecerasCors, clienteDeServicio, clienteDeUsuario, responder } from '../_compartido/comun.ts';

interface Cuerpo {
  correo?: unknown;
  nombre?: unknown;
  telefono?: unknown;
  cantones?: unknown;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabecerasCors(req) });
  if (req.method !== 'POST') return responder(req, { error: 'Método no permitido.' }, 405);

  // 1. ¿Quien llama es administrador con 2FA?
  const usuario = clienteDeUsuario(req);
  const { data: esAdmin, error: errorRol } = await usuario.rpc('es_admin');
  if (errorRol || esAdmin !== true) {
    return responder(req, { error: 'Solo un administrador con verificación en dos pasos puede invitar encargados.' }, 403);
  }

  // 2. Validar datos
  let cuerpo: Cuerpo;
  try {
    cuerpo = await req.json();
  } catch {
    return responder(req, { error: 'Datos inválidos.' }, 400);
  }
  const correo = typeof cuerpo.correo === 'string' ? cuerpo.correo.trim().toLowerCase() : '';
  const nombre = typeof cuerpo.nombre === 'string' ? cuerpo.nombre.trim().slice(0, 80) : '';
  const telefono = typeof cuerpo.telefono === 'string' ? cuerpo.telefono.trim() : '';
  const cantones = Array.isArray(cuerpo.cantones)
    ? [...new Set(cuerpo.cantones.filter((c): c is number => Number.isInteger(c) && c > 0))]
    : [];

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return responder(req, { error: 'Correo inválido.' }, 400);
  if (nombre.length < 3) return responder(req, { error: 'Escribe el nombre del encargado.' }, 400);
  if (!/^\+[1-9]\d{7,14}$/.test(telefono)) return responder(req, { error: 'Teléfono inválido.' }, 400);
  if (cantones.length === 0 || cantones.length > 250) {
    return responder(req, { error: 'Elige entre 1 y 250 cantones.' }, 400);
  }

  const servicio = clienteDeServicio();

  // 3. ¿Ya tiene cuenta?
  const { data: existente, error: errorBusqueda } = await servicio.rpc('id_por_correo', { p_correo: correo });
  if (errorBusqueda) return responder(req, { error: 'No se pudo revisar el correo.' }, 500);

  let id = existente as string | null;
  let invitado = false;

  if (id) {
    const { data: perfil } = await servicio.from('perfiles').select('rol').eq('id', id).single();
    if (perfil?.rol === 'admin') {
      return responder(req, { error: 'Esa persona es administrador. Cambia su rol desde Personas si corresponde.' }, 409);
    }
    const { error } = await servicio.from('perfiles').update({ rol: 'encargado' }).eq('id', id);
    if (error) return responder(req, { error: 'No se pudo actualizar el rol.' }, 500);
  } else {
    const { data, error } = await servicio.auth.admin.inviteUserByEmail(correo, {
      data: { nombre },
      redirectTo: APP_URL || undefined,
    });
    if (error || !data.user) {
      return responder(req, { error: `No se pudo enviar la invitación: ${error?.message ?? 'error desconocido'}` }, 400);
    }
    id = data.user.id;
    invitado = true;
    // El perfil lo crea el disparador al_crear_usuario; aquí se completa
    const { error: errorPerfil } = await servicio
      .from('perfiles')
      .update({ rol: 'encargado', nombre, telefono })
      .eq('id', id);
    if (errorPerfil) return responder(req, { error: 'Se invitó, pero no se pudo guardar el perfil.' }, 500);
  }

  // 4. Zonas
  await servicio.from('encargado_zonas').delete().eq('encargado_id', id);
  const { error: errorZonas } = await servicio
    .from('encargado_zonas')
    .insert(cantones.map((canton_id) => ({ encargado_id: id, canton_id })));
  if (errorZonas) return responder(req, { error: 'No se pudieron guardar los cantones.' }, 500);

  return responder(req, { ok: true, id, invitado });
});
