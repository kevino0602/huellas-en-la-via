import type { ReactNode } from 'react';
import type { EstadoCaso, EstadoRevision } from '../lib/tipos';
import { ESTADOS_CASO, ESTADOS_REVISION } from '../lib/tipos';

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="cargando" role="status">
      <span className="girador" aria-hidden="true" />
      {texto}
    </div>
  );
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'error' | 'exito' | 'alerta'; children: ReactNode }) {
  return (
    <div className={`aviso aviso-${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="vacio">
      <h3>{titulo}</h3>
      {children}
    </div>
  );
}

export function ChipCaso({ estado }: { estado: EstadoCaso }) {
  return <span className={`chip chip-${estado}`}>{ESTADOS_CASO[estado]}</span>;
}

export function ChipRevision({ estado }: { estado: EstadoRevision }) {
  return <span className={`chip chip-${estado}`}>{ESTADOS_REVISION[estado]}</span>;
}

export function Encabezado({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <header className="encabezado-pagina">
      <h1>{titulo}</h1>
      {children && <p className="bajada">{children}</p>}
    </header>
  );
}
