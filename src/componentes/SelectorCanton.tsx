import { useMemo, useState } from 'react';
import type { Territorio } from '../lib/territorio';

interface Props {
  territorio: Territorio;
  valor: number | null;
  alCambiar: (id: number | null) => void;
  idBase: string;
}

/** Provincia → cantón, para el perfil y los reportes */
export function SelectorCanton({ territorio, valor, alCambiar, idBase }: Props) {
  const provinciaInicial = valor ? territorio.cantones.find((c) => c.id === valor)?.provincia_id ?? null : null;
  const [provincia, setProvincia] = useState<number | null>(provinciaInicial);
  const cantones = useMemo(
    () => territorio.cantones.filter((c) => c.provincia_id === provincia),
    [territorio, provincia],
  );

  return (
    <div className="fila-2">
      <div className="campo">
        <label htmlFor={`${idBase}-provincia`}>Provincia</label>
        <select
          id={`${idBase}-provincia`}
          value={provincia ?? ''}
          onChange={(e) => {
            setProvincia(e.target.value ? Number(e.target.value) : null);
            alCambiar(null);
          }}
          required
        >
          <option value="">Elige una provincia</option>
          {territorio.provincias.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label htmlFor={`${idBase}-canton`}>Cantón</label>
        <select
          id={`${idBase}-canton`}
          value={valor ?? ''}
          onChange={(e) => alCambiar(e.target.value ? Number(e.target.value) : null)}
          disabled={!provincia}
          required
        >
          <option value="">{provincia ? 'Elige un cantón' : 'Primero la provincia'}</option>
          {cantones.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Varios cantones, para las zonas de un encargado */
export function SelectorCantones({
  territorio,
  valor,
  alCambiar,
  idBase,
}: {
  territorio: Territorio;
  valor: number[];
  alCambiar: (ids: number[]) => void;
  idBase: string;
}) {
  const [provincia, setProvincia] = useState<number | null>(null);
  const elegidos = new Set(valor);
  const cantones = territorio.cantones.filter((c) => c.provincia_id === provincia);

  function alternar(id: number) {
    const s = new Set(elegidos);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    alCambiar([...s].sort((a, b) => a - b));
  }

  return (
    <div className="selector-zonas">
      {valor.length > 0 && (
        <ul className="fichas" aria-label="Cantones elegidos">
          {valor.map((id) => (
            <li key={id}>
              {territorio.nombreCanton(id)}
              <button type="button" aria-label={`Quitar ${territorio.nombreCanton(id)}`} onClick={() => alternar(id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="campo">
        <label htmlFor={`${idBase}-provincia`}>Agregar cantones de la provincia</label>
        <select
          id={`${idBase}-provincia`}
          value={provincia ?? ''}
          onChange={(e) => setProvincia(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Elige una provincia</option>
          {territorio.provincias.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>
      {provincia && (
        <div className="lista-marcar">
          {cantones.map((c) => (
            <label key={c.id} className="marcar">
              <input type="checkbox" checked={elegidos.has(c.id)} onChange={() => alternar(c.id)} />
              {c.nombre}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
