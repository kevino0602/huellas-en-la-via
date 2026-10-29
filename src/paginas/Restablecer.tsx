import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { Aviso } from '../componentes/ui';
import { mensajeError, supabase } from '../lib/supabase';
import { validarContrasena } from './Ingresar';

/** Crear contraseña: al aceptar una invitación o al recuperar la cuenta */
export function Restablecer() {
  const { contrasenaCreada, perfil } = useAuth();
  const navegar = useNavigate();
  const [contrasena, setContrasena] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const problema = validarContrasena(contrasena);
    if (problema) return setError(problema);
    if (contrasena !== confirmar) return setError('Las contraseñas no coinciden.');
    setEnviando(true);
    const { error } = await supabase.auth.updateUser({ password: contrasena });
    setEnviando(false);
    if (error) return setError(mensajeError(error));
    contrasenaCreada();
    navegar('/', { replace: true });
  }

  return (
    <div className="pantalla-acceso">
      <div className="tarjeta-acceso">
        <h1>Crea tu contraseña</h1>
        {perfil?.rol === 'encargado' && (
          <p>Te invitaron como encargado de Huellas en la Vía. Crea una contraseña para entrar.</p>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
        <form onSubmit={enviar} className="formulario" noValidate>
          <div className="campo">
            <label htmlFor="nueva">Contraseña nueva</label>
            <input
              id="nueva"
              type="password"
              autoComplete="new-password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
            />
            <p className="ayuda">Mínimo 10 caracteres, con letras y números.</p>
          </div>
          <div className="campo">
            <label htmlFor="repetir">Repite la contraseña</label>
            <input
              id="repetir"
              type="password"
              autoComplete="new-password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
            />
          </div>
          <button type="submit" className="boton boton-principal" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
