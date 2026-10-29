// Se importa ANTES que Supabase en main.tsx: Supabase limpia el "#..." de la
// URL al leer la sesión, y necesitamos saber si el enlace era una invitación
// o una recuperación de contraseña para pedir una contraseña nueva.
const hash = typeof window !== 'undefined' ? window.location.hash : '';

export const enlaceInicial = {
  esInvitacion: /type=invite/.test(hash),
  esRecuperacion: /type=recovery/.test(hash),
};
