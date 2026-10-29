import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Aviso, Encabezado } from '../componentes/ui';
import { mensajeError, supabase } from '../lib/supabase';
import { ROLES } from '../lib/tipos';
import { FormPerfil } from './FormPerfil';

export function Perfil() {
  const { perfil, sesion, salir } = useAuth();
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);

  async function eliminarCuenta() {
    setError(null);
    setEliminando(true);
    const { error } = await supabase.functions.invoke('eliminar-cuenta', { body: { confirmacion } });
    setEliminando(false);
    if (error) {
      // El mensaje útil viene en el cuerpo de la respuesta de la función
      let mensaje = mensajeError(error);
      const contexto = (error as { context?: Response }).context;
      if (contexto) {
        try {
          mensaje = ((await contexto.json()) as { error?: string }).error ?? mensaje;
        } catch {
          /* respuesta sin JSON */
        }
      }
      setError(mensaje);
      return;
    }
    await salir();
  }

  if (!perfil) return null;

  return (
    <div className="pagina">
      <Encabezado titulo="Tu perfil">
        {sesion?.user.email} · {ROLES[perfil.rol]}
      </Encabezado>

      {perfil.bloqueado && (
        <Aviso tipo="error">
          Tu cuenta está bloqueada para reportar porque varios reportes fueron marcados como falsos. Si crees que es un
          error, escribe al administrador.
        </Aviso>
      )}
      {!perfil.bloqueado && perfil.advertencias > 0 && (
        <Aviso tipo="alerta">
          Tienes {perfil.advertencias} {perfil.advertencias === 1 ? 'advertencia' : 'advertencias'} por reportes falsos.
        </Aviso>
      )}

      <section className="seccion">
        <h2>Datos de contacto</h2>
        <FormPerfil />
      </section>

      <section className="seccion">
        <h2>Sesión</h2>
        <button type="button" className="boton" onClick={() => void salir()}>
          Cerrar sesión
        </button>
      </section>

      <section className="seccion zona-peligro">
        <h2>Eliminar mi cuenta</h2>
        <p>
          Se borran tu cuenta y tus datos de contacto. Los reportes que ya fueron aprobados se conservan sin tu nombre,
          porque forman parte de casos atendidos.
        </p>
        {perfil.rol !== 'usuario' ? (
          <p className="ayuda">
            Como {ROLES[perfil.rol].toLowerCase()}, primero otro administrador debe cambiar tu rol a usuario.
          </p>
        ) : (
          <>
            {error && <Aviso tipo="error">{error}</Aviso>}
            <div className="campo">
              <label htmlFor="confirmar-eliminar">Escribe ELIMINAR para confirmar</label>
              <input id="confirmar-eliminar" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} />
            </div>
            <button
              type="button"
              className="boton boton-peligro"
              disabled={confirmacion !== 'ELIMINAR' || eliminando}
              onClick={eliminarCuenta}
            >
              {eliminando ? 'Eliminando…' : 'Eliminar mi cuenta'}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
