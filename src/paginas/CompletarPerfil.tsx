import { useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { FormPerfil } from './FormPerfil';

export function CompletarPerfil() {
  const navegar = useNavigate();
  const { salir } = useAuth();
  return (
    <div className="pantalla-acceso">
      <div className="tarjeta-acceso">
        <h1>Tus datos de contacto</h1>
        <p>
          Pedimos estos datos para que cada reporte tenga una persona responsable detrás y así evitar información falsa.
          Nadie más que el administrador los ve.
        </p>
        <FormPerfil alGuardar={() => navegar('/', { replace: true })} />
        <p className="centrado">
          <button type="button" className="enlace" onClick={() => void salir()}>
            Cerrar sesión
          </button>
        </p>
      </div>
    </div>
  );
}
