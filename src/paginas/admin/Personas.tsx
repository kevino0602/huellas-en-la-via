import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { SelectorCantones } from '../../componentes/SelectorCanton';
import { Aviso, Cargando, Encabezado, Vacio } from '../../componentes/ui';
import { normalizarTelefono, telefonoLegible } from '../../lib/formato';
import { mensajeError, rpc, supabase } from '../../lib/supabase';
import { useTerritorio, type Territorio } from '../../lib/territorio';
import { ROLES, type Persona, type Rol } from '../../lib/tipos';

type Pestana = 'encargados' | 'invitar' | 'buscar' | 'bloqueados';

export function Personas() {
  const territorio = useTerritorio();
  const [pestana, setPestana] = useState<Pestana>('encargados');

  if (!territorio) return <Cargando />;

  return (
    <div className="pagina">
      <Encabezado titulo="Personas">Encargados, roles y cuentas bloqueadas.</Encabezado>
      <div className="pestanas" role="tablist">
        {(
          [
            ['encargados', 'Encargados'],
            ['invitar', 'Invitar encargado'],
            ['buscar', 'Buscar'],
            ['bloqueados', 'Bloqueados'],
          ] as [Pestana, string][]
        ).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)}>
            {t}
          </button>
        ))}
      </div>
      {pestana === 'encargados' && <ListaPersonas territorio={territorio} filtro={{ p_rol: 'encargado' }} />}
      {pestana === 'invitar' && <InvitarEncargado territorio={territorio} alInvitar={() => setPestana('encargados')} />}
      {pestana === 'buscar' && <Buscar territorio={territorio} />}
      {pestana === 'bloqueados' && <ListaPersonas territorio={territorio} filtro={{ p_solo_bloqueados: true }} />}
    </div>
  );
}

function Buscar({ territorio }: { territorio: Territorio }) {
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState<string | null>(null);
  return (
    <>
      <form
        className="fila-busqueda"
        onSubmit={(e) => {
          e.preventDefault();
          setBusqueda(texto.trim());
        }}
      >
        <div className="campo">
          <label htmlFor="buscar-persona">Nombre, correo o teléfono</label>
          <input id="buscar-persona" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <button type="submit" className="boton boton-principal">
          Buscar
        </button>
      </form>
      {busqueda !== null && <ListaPersonas territorio={territorio} filtro={{ p_texto: busqueda }} />}
    </>
  );
}

function ListaPersonas({ territorio, filtro }: { territorio: Territorio; filtro: Record<string, unknown> }) {
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clave = JSON.stringify(filtro);

  const cargar = useCallback(async () => {
    try {
      setPersonas(await rpc<Persona[]>('buscar_personas', { p_texto: '', ...JSON.parse(clave) }));
    } catch (e) {
      setError(mensajeError(e));
      setPersonas([]);
    }
  }, [clave]);

  useEffect(() => {
    setPersonas(null);
    void cargar();
  }, [cargar]);

  if (!personas) return <Cargando />;
  return (
    <>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {personas.length === 0 ? (
        <Vacio titulo="Sin resultados" />
      ) : (
        <ul className="lista">
          {personas.map((p) => (
            <FilaPersona key={p.id} persona={p} territorio={territorio} alCambiar={cargar} />
          ))}
        </ul>
      )}
    </>
  );
}

function FilaPersona({
  persona: p,
  territorio,
  alCambiar,
}: {
  persona: Persona;
  territorio: Territorio;
  alCambiar: () => Promise<void>;
}) {
  const [editandoZonas, setEditandoZonas] = useState(false);
  const [zonas, setZonas] = useState<number[]>(p.zonas);
  const [rolNuevo, setRolNuevo] = useState<Rol>(p.rol);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function hacer(fn: () => Promise<unknown>) {
    setError(null);
    setOcupado(true);
    try {
      await fn();
      setEditandoZonas(false);
      await alCambiar();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <li className="tarjeta">
      <div className="tarjeta-titulo">
        <strong>{p.nombre || 'Sin nombre'}</strong>
        <span className="chip">{ROLES[p.rol]}</span>
        {p.bloqueado && <span className="chip chip-alerta">Bloqueado</span>}
      </div>
      <div className="ayuda seleccionable">
        {p.correo}
        {p.telefono && ` · ${telefonoLegible(p.telefono)}`}
        {p.canton && ` · ${p.canton}, ${p.provincia}`}
        {p.advertencias > 0 && ` · ${p.advertencias} advertencias`}
      </div>
      {p.rol === 'encargado' && (
        <div className="ayuda">
          Zonas: {p.zonas.length ? p.zonas.map((z) => territorio.nombreCanton(z)).join(' · ') : 'ninguna asignada'}
        </div>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}

      {editandoZonas ? (
        <div className="panel">
          <SelectorCantones territorio={territorio} valor={zonas} alCambiar={setZonas} idBase={`zonas-${p.id}`} />
          <div className="acciones">
            <button
              type="button"
              className="boton boton-principal"
              disabled={ocupado}
              onClick={() => void hacer(() => rpc('definir_zonas', { p_encargado: p.id, p_cantones: zonas }))}
            >
              Guardar zonas
            </button>
            <button type="button" className="boton boton-texto" onClick={() => setEditandoZonas(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="acciones">
          {p.rol === 'encargado' && (
            <button type="button" className="boton" onClick={() => setEditandoZonas(true)}>
              Editar zonas
            </button>
          )}
          <select aria-label={`Rol de ${p.nombre}`} value={rolNuevo} onChange={(e) => setRolNuevo(e.target.value as Rol)}>
            {(Object.keys(ROLES) as Rol[]).map((r) => (
              <option key={r} value={r}>
                {ROLES[r]}
              </option>
            ))}
          </select>
          {rolNuevo !== p.rol && (
            <button
              type="button"
              className="boton"
              disabled={ocupado}
              onClick={() => void hacer(() => rpc('cambiar_rol', { p_persona: p.id, p_rol: rolNuevo }))}
            >
              Cambiar a {ROLES[rolNuevo].toLowerCase()}
            </button>
          )}
          <button
            type="button"
            className="boton boton-texto"
            disabled={ocupado}
            onClick={() => void hacer(() => rpc('cambiar_bloqueo', { p_persona: p.id, p_bloqueado: !p.bloqueado }))}
          >
            {p.bloqueado ? 'Desbloquear' : 'Bloquear'}
          </button>
        </div>
      )}
    </li>
  );
}

function InvitarEncargado({ territorio, alInvitar }: { territorio: Territorio; alInvitar: () => void }) {
  const [correo, setCorreo] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [zonas, setZonas] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(null);
    const tel = normalizarTelefono(telefono);
    if (!/^\S+@\S+\.\S+$/.test(correo.trim())) return setError('Escribe un correo válido.');
    if (nombre.trim().length < 3) return setError('Escribe el nombre del encargado.');
    if (!tel) return setError('Escribe un celular válido, por ejemplo 0987654321.');
    if (zonas.length === 0) return setError('Elige al menos un cantón para el encargado.');

    setEnviando(true);
    const { data, error } = await supabase.functions.invoke('invitar-encargado', {
      body: { correo: correo.trim(), nombre: nombre.trim(), telefono: tel, cantones: zonas },
    });
    setEnviando(false);
    if (error) {
      let mensaje = mensajeError(error);
      const contexto = (error as { context?: Response }).context;
      if (contexto) {
        try {
          mensaje = ((await contexto.json()) as { error?: string }).error ?? mensaje;
        } catch {
          /* sin JSON */
        }
      }
      return setError(mensaje);
    }
    const r = data as { invitado: boolean };
    setExito(
      r.invitado
        ? `Invitación enviada a ${correo.trim()}. Al abrir el correo creará su contraseña y configurará la verificación en dos pasos.`
        : `${correo.trim()} ya tenía cuenta: ahora es encargado. La próxima vez que entre se le pedirá la verificación en dos pasos.`,
    );
    setCorreo('');
    setNombre('');
    setTelefono('');
    setZonas([]);
    setTimeout(alInvitar, 2500);
  }

  return (
    <form className="formulario" onSubmit={enviar} noValidate>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {exito && <Aviso tipo="exito">{exito}</Aviso>}
      <div className="campo">
        <label htmlFor="inv-correo">Correo</label>
        <input id="inv-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
      </div>
      <div className="fila-2">
        <div className="campo">
          <label htmlFor="inv-nombre">Nombre completo</label>
          <input id="inv-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} />
        </div>
        <div className="campo">
          <label htmlFor="inv-telefono">Celular</label>
          <input id="inv-telefono" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </div>
      </div>
      <fieldset className="campo">
        <legend>Cantones que atenderá</legend>
        <SelectorCantones territorio={territorio} valor={zonas} alCambiar={setZonas} idBase="inv" />
      </fieldset>
      <button type="submit" className="boton boton-principal" disabled={enviando}>
        {enviando ? 'Enviando invitación…' : 'Invitar encargado'}
      </button>
    </form>
  );
}
