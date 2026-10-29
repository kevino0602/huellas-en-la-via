import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { enviarPendientes, eventosCola, listarPendientes } from '../lib/colaOffline';
import type { Rol } from '../lib/tipos';

const MENU: Record<Rol, { a: string; texto: string }[]> = {
  usuario: [
    { a: '/reportar', texto: 'Reportar' },
    { a: '/mis-reportes', texto: 'Mis reportes' },
    { a: '/mapa', texto: 'Mapa' },
    { a: '/perfil', texto: 'Perfil' },
  ],
  encargado: [
    { a: '/casos', texto: 'Casos' },
    { a: '/reportar', texto: 'Reportar' },
    { a: '/mis-reportes', texto: 'Mis reportes' },
    { a: '/perfil', texto: 'Perfil' },
  ],
  admin: [
    { a: '/admin/revision', texto: 'Revisión' },
    { a: '/admin/casos', texto: 'Casos' },
    { a: '/admin/personas', texto: 'Personas' },
    { a: '/reportar', texto: 'Reportar' },
    { a: '/perfil', texto: 'Perfil' },
  ],
};

/** Reportes guardados sin señal: cuenta y envío automático al volver la conexión */
function useColaPendiente(usuarioId: string | undefined) {
  const [pendientes, setPendientes] = useState(0);
  const [enLinea, setEnLinea] = useState(navigator.onLine);

  const contar = useCallback(async () => {
    if (!usuarioId) return;
    setPendientes((await listarPendientes(usuarioId)).length);
  }, [usuarioId]);

  const enviar = useCallback(async () => {
    if (!usuarioId) return;
    await enviarPendientes(usuarioId);
    await contar();
  }, [usuarioId, contar]);

  useEffect(() => {
    void contar();
    void enviar();
    const alCambiar = () => void contar();
    const alConectar = () => {
      setEnLinea(true);
      void enviar();
    };
    const alDesconectar = () => setEnLinea(false);
    eventosCola.addEventListener('cambio', alCambiar);
    window.addEventListener('online', alConectar);
    window.addEventListener('offline', alDesconectar);
    return () => {
      eventosCola.removeEventListener('cambio', alCambiar);
      window.removeEventListener('online', alConectar);
      window.removeEventListener('offline', alDesconectar);
    };
  }, [contar, enviar]);

  return { pendientes, enLinea, enviar };
}

export function Layout() {
  const { perfil } = useAuth();
  const { pendientes, enLinea, enviar } = useColaPendiente(perfil?.id);
  const menu = MENU[perfil?.rol ?? 'usuario'];

  return (
    <div className="marco">
      <header className="barra">
        <div className="barra-interior">
          <NavLink to="/" className="marca">
            <img src="/favicon.svg" alt="" width={28} height={28} />
            Huellas en la Vía
          </NavLink>
          <nav className="menu" aria-label="Principal">
            {menu.map((m) => (
              <NavLink key={m.a} to={m.a}>
                {m.texto}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="linea-via" aria-hidden="true" />
      </header>

      {!enLinea && (
        <div className="franja franja-alerta">Sin conexión. Puedes reportar igual: se enviará al volver la señal.</div>
      )}
      {enLinea && pendientes > 0 && (
        <div className="franja">
          {pendientes === 1 ? '1 reporte guardado sin señal.' : `${pendientes} reportes guardados sin señal.`}{' '}
          <button type="button" className="enlace" onClick={() => void enviar()}>
            Enviar ahora
          </button>
        </div>
      )}

      <main className="contenido">
        <Outlet />
      </main>

      <footer className="pie">
        Huellas en la Vía by KPSB · <NavLink to="/privacidad">Privacidad</NavLink>
      </footer>
    </div>
  );
}
