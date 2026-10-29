import { Link } from 'react-router';
import { lugarCaso, referenciaCaso, type CasoDetallado } from '../lib/consultas';
import { haceCuanto } from '../lib/formato';
import { ESPECIES } from '../lib/tipos';
import { FotoPrivada } from './FotoPrivada';
import { ChipCaso } from './ui';

export function TarjetaCaso({ caso, extra }: { caso: CasoDetallado; extra?: string }) {
  const foto = caso.reportes[0]?.foto_path;
  return (
    <li className="tarjeta tarjeta-con-foto">
      {foto ? (
        <FotoPrivada bucket="reportes" ruta={foto} alt={`Foto del caso: ${ESPECIES[caso.especie]}`} />
      ) : (
        <div className="foto foto-vacia">Sin foto</div>
      )}
      <div className="tarjeta-cuerpo">
        <div className="tarjeta-titulo">
          <strong>{ESPECIES[caso.especie]}</strong>
          <ChipCaso estado={caso.estado} />
        </div>
        <div>{referenciaCaso(caso)}</div>
        <div className="ayuda">
          {lugarCaso(caso)} · aprobado {haceCuanto(caso.creado_en)}
          {caso.reportes.length > 1 && ` · ${caso.reportes.length} reportes`}
        </div>
        {extra && <div className="ayuda">{extra}</div>}
        <div className="acciones">
          <Link to={`/casos/${caso.id}`} className="boton">
            Ver caso
          </Link>
        </div>
      </div>
    </li>
  );
}
