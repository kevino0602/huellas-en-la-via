import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Captcha, captchaActivo, type CaptchaRef } from '../componentes/Captcha';
import { Aviso } from '../componentes/ui';
import { config } from '../config';
import { mensajeError, supabase } from '../lib/supabase';

type Modo = 'entrar' | 'crear' | 'recuperar';

export function validarContrasena(c: string): string | null {
  if (c.length < config.contrasena.longitudMinima)
    return `La contraseña debe tener al menos ${config.contrasena.longitudMinima} caracteres.`;
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(c) || !/\d/.test(c)) return 'La contraseña debe tener letras y números.';
  return null;
}

export function Ingresar() {
  const [modo, setModo] = useState<Modo>('entrar');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [nombre, setNombre] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const captcha = useRef<CaptchaRef>(null);

  function cambiarModo(m: Modo) {
    setModo(m);
    setError(null);
    setExito(null);
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(null);
    if (captchaActivo && !token) {
      setError('Completa la verificación de seguridad.');
      return;
    }
    const opcionesCaptcha = token ? { captchaToken: token } : {};
    setEnviando(true);
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({
          email: correo.trim(),
          password: contrasena,
          options: opcionesCaptcha,
        });
        if (error) throw error;
      } else if (modo === 'crear') {
        if (nombre.trim().length < 3) throw new Error('Escribe tu nombre completo.');
        const problema = validarContrasena(contrasena);
        if (problema) throw new Error(problema);
        if (contrasena !== confirmar) throw new Error('Las contraseñas no coinciden.');
        const { data, error } = await supabase.auth.signUp({
          email: correo.trim(),
          password: contrasena,
          options: { ...opcionesCaptcha, data: { nombre: nombre.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setExito(`Te enviamos un correo a ${correo.trim()}. Abre el enlace para confirmar tu cuenta y luego inicia sesión.`);
          setModo('entrar');
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(correo.trim(), {
          ...opcionesCaptcha,
          redirectTo: `${window.location.origin}/restablecer`,
        });
        if (error) throw error;
        setExito('Si el correo está registrado, te llegará un enlace para crear una contraseña nueva.');
      }
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
      captcha.current?.reiniciar();
    }
  }

  async function conGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(mensajeError(error));
  }

  return (
    <div className="pantalla-acceso">
      <div className="tarjeta-acceso">
        <div className="marca-grande">
          <img src="/favicon.svg" alt="" width={56} height={56} />
          <h1>Huellas en la Vía</h1>
          <p>Reporta animales muertos en la calle para que los levanten.</p>
        </div>

        {modo !== 'recuperar' && (
          <div className="pestanas" role="tablist">
            <button type="button" role="tab" aria-selected={modo === 'entrar'} onClick={() => cambiarModo('entrar')}>
              Iniciar sesión
            </button>
            <button type="button" role="tab" aria-selected={modo === 'crear'} onClick={() => cambiarModo('crear')}>
              Crear cuenta
            </button>
          </div>
        )}

        {exito && <Aviso tipo="exito">{exito}</Aviso>}
        {error && <Aviso tipo="error">{error}</Aviso>}

        {modo !== 'recuperar' && (
          <>
            <button type="button" className="boton boton-google" onClick={conGoogle}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
                <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
              </svg>
              Continuar con Google
            </button>
            <div className="separador">o con tu correo (Gmail, Hotmail, iCloud, Yahoo…)</div>
          </>
        )}

        <form onSubmit={enviar} className="formulario" noValidate>
          {modo === 'crear' && (
            <div className="campo">
              <label htmlFor="nombre">Nombre completo</label>
              <input id="nombre" autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>
          )}
          <div className="campo">
            <label htmlFor="correo">Correo electrónico</label>
            <input
              id="correo"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              required
            />
          </div>
          {modo !== 'recuperar' && (
            <div className="campo">
              <label htmlFor="contrasena">Contraseña</label>
              <input
                id="contrasena"
                type="password"
                autoComplete={modo === 'crear' ? 'new-password' : 'current-password'}
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                required
              />
              {modo === 'crear' && (
                <p className="ayuda">Mínimo {config.contrasena.longitudMinima} caracteres, con letras y números.</p>
              )}
            </div>
          )}
          {modo === 'crear' && (
            <div className="campo">
              <label htmlFor="confirmar">Repite la contraseña</label>
              <input
                id="confirmar"
                type="password"
                autoComplete="new-password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                required
              />
            </div>
          )}

          <Captcha ref={captcha} alCambiar={setToken} />

          <button type="submit" className="boton boton-principal" disabled={enviando}>
            {enviando
              ? 'Un momento…'
              : modo === 'entrar'
                ? 'Iniciar sesión'
                : modo === 'crear'
                  ? 'Crear cuenta'
                  : 'Enviar enlace'}
          </button>
        </form>

        <p className="centrado">
          {modo === 'recuperar' ? (
            <button type="button" className="enlace" onClick={() => cambiarModo('entrar')}>
              Volver a iniciar sesión
            </button>
          ) : (
            <button type="button" className="enlace" onClick={() => cambiarModo('recuperar')}>
              Olvidé mi contraseña
            </button>
          )}
        </p>
        <p className="pie-acceso">
          Al crear una cuenta aceptas la <Link to="/privacidad">política de privacidad</Link>.
          <br />
          Huellas en la Vía by KPSB
        </p>
      </div>
    </div>
  );
}
