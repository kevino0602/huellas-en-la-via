import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { SelectorCanton } from '../componentes/SelectorCanton';
import { Aviso, Cargando } from '../componentes/ui';
import { normalizarTelefono, telefonoLegible } from '../lib/formato';
import { mensajeError, supabase } from '../lib/supabase';
import { useTerritorio } from '../lib/territorio';

/** Datos de contacto. Se usa al completar el perfil y en la página Perfil. */
export function FormPerfil({ alGuardar }: { alGuardar?: () => void }) {
  const { perfil, recargar } = useAuth();
  const territorio = useTerritorio();
  const [nombre, setNombre] = useState(perfil?.nombre ?? '');
  const [telefono, setTelefono] = useState(telefonoLegible(perfil?.telefono));
  const [canton, setCanton] = useState<number | null>(perfil?.canton_id ?? null);
  const [acepta, setAcepta] = useState(Boolean(perfil?.acepto_privacidad_en));
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  if (!perfil) return null;
  if (!territorio) return <Cargando />;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardado(false);
    const tel = normalizarTelefono(telefono);
    if (nombre.trim().length < 3) return setError('Escribe tu nombre completo.');
    if (!tel) return setError('Escribe un número de celular válido, por ejemplo 0987654321.');
    if (!canton) return setError('Elige tu provincia y cantón.');
    if (!acepta) return setError('Para usar la app debes aceptar la política de privacidad.');

    setEnviando(true);
    const cambios: Record<string, unknown> = { nombre: nombre.trim(), telefono: tel, canton_id: canton };
    // La fecha real la pone la base de datos (ver sellar_privacidad)
    if (!perfil!.acepto_privacidad_en) cambios.acepto_privacidad_en = new Date().toISOString();
    const { error } = await supabase.from('perfiles').update(cambios).eq('id', perfil!.id);
    setEnviando(false);
    if (error) return setError(mensajeError(error));
    await recargar();
    setGuardado(true);
    alGuardar?.();
  }

  return (
    <form onSubmit={guardar} className="formulario" noValidate>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {guardado && <Aviso tipo="exito">Datos guardados.</Aviso>}
      <div className="campo">
        <label htmlFor="perfil-nombre">Nombre completo</label>
        <input id="perfil-nombre" autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} />
      </div>
      <div className="campo">
        <label htmlFor="perfil-telefono">Celular</label>
        <input
          id="perfil-telefono"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0987654321"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
        />
        <p className="ayuda">Solo lo ve el administrador, por si necesita confirmar un reporte contigo.</p>
      </div>
      <SelectorCanton territorio={territorio} valor={canton} alCambiar={setCanton} idBase="perfil" />
      {!perfil.acepto_privacidad_en && (
        <label className="marcar">
          <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
          <span>
            Leí y acepto la{' '}
            <Link to="/privacidad" target="_blank">
              política de privacidad
            </Link>{' '}
            y el tratamiento de mis datos de contacto para gestionar los reportes.
          </span>
        </label>
      )}
      <button type="submit" className="boton boton-principal" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  );
}
