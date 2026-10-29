import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { Aviso, Cargando } from '../componentes/ui';
import { mensajeError, supabase } from '../lib/supabase';

interface Inscripcion {
  factorId: string;
  qr: string;
  secreto: string;
}

/**
 * Verificación en dos pasos (TOTP con Google Authenticator, Authy, etc.).
 * Obligatoria para administradores y encargados: sin ella, la base de datos
 * rechaza sus acciones (ver es_admin() y es_encargado() en las migraciones).
 */
export function Verificar2FA() {
  const { recargar, salir, perfil } = useAuth();
  const navegar = useNavigate();
  const [cargando, setCargando] = useState(true);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [inscripcion, setInscripcion] = useState<Inscripcion | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    let vivo = true;
    async function preparar() {
      try {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;
        const verificado = data.totp.find((f) => f.status === 'verified');
        if (verificado) {
          if (vivo) setFactorId(verificado.id);
          return;
        }
        // Limpia intentos de inscripción anteriores que quedaron a medias
        for (const f of data.all.filter((x) => x.status !== 'verified')) {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
        const inscrito = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: `Huellas en la Vía ${new Date().toISOString().slice(0, 10)}`,
        });
        if (inscrito.error) throw inscrito.error;
        const qr = inscrito.data.totp.qr_code;
        if (vivo) {
          setFactorId(inscrito.data.id);
          setInscripcion({
            factorId: inscrito.data.id,
            qr: qr.startsWith('data:') ? qr : `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}`,
            secreto: inscrito.data.totp.secret,
          });
        }
      } catch (e) {
        if (vivo) setError(mensajeError(e));
      } finally {
        if (vivo) setCargando(false);
      }
    }
    void preparar();
    return () => {
      vivo = false;
    };
  }, []);

  async function verificar(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    setVerificando(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: codigo.replace(/\s/g, '') });
    setVerificando(false);
    if (error) {
      setError(mensajeError(error));
      return;
    }
    await recargar();
    navegar('/', { replace: true });
  }

  if (cargando) return <Cargando texto="Preparando la verificación…" />;

  return (
    <div className="pantalla-acceso">
      <div className="tarjeta-acceso">
        <h1>Verificación en dos pasos</h1>
        <p>
          Como {perfil?.rol === 'admin' ? 'administrador' : 'encargado'}, tu cuenta necesita un código de una app de
          autenticación además de la contraseña.
        </p>
        {error && <Aviso tipo="error">{error}</Aviso>}

        {inscripcion && (
          <ol className="pasos">
            <li>
              Instala <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong> o{' '}
              <strong>Authy</strong> en tu celular.
            </li>
            <li>
              En la app, agrega una cuenta y escanea este código:
              <img className="qr" src={inscripcion.qr} alt="Código QR para la app de autenticación" />
              <details>
                <summary>No puedo escanear</summary>
                <p>Escribe esta clave en la app:</p>
                <code className="secreto">{inscripcion.secreto}</code>
              </details>
            </li>
            <li>Escribe el código de 6 dígitos que muestra la app.</li>
          </ol>
        )}

        {factorId && (
          <form onSubmit={verificar} className="formulario">
            <div className="campo">
              <label htmlFor="codigo">Código de 6 dígitos</label>
              <input
                id="codigo"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                maxLength={7}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className="entrada-codigo"
                autoFocus
              />
            </div>
            <button type="submit" className="boton boton-principal" disabled={verificando || codigo.replace(/\s/g, '').length !== 6}>
              {verificando ? 'Verificando…' : 'Verificar'}
            </button>
          </form>
        )}

        <p className="centrado">
          <button type="button" className="enlace" onClick={() => void salir()}>
            Cerrar sesión
          </button>
        </p>
      </div>
    </div>
  );
}
