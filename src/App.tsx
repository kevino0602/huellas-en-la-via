import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { perfilCompleto, useAuth } from './auth/AuthProvider';
import { Layout } from './componentes/Layout';
import { Aviso, Cargando } from './componentes/ui';
import { configuracionCompleta } from './lib/supabase';
import { CasosAdmin } from './paginas/admin/CasosAdmin';
import { Personas } from './paginas/admin/Personas';
import { Revision } from './paginas/admin/Revision';
import { CasoDetalle } from './paginas/CasoDetalle';
import { CompletarPerfil } from './paginas/CompletarPerfil';
import { CasosEncargado } from './paginas/encargado/Casos';
import { Ingresar } from './paginas/Ingresar';
import { Perfil } from './paginas/Perfil';
import { Privacidad } from './paginas/Privacidad';
import { Restablecer } from './paginas/Restablecer';
import { Mapa } from './paginas/usuario/Mapa';
import { MisReportes } from './paginas/usuario/MisReportes';
import { Reportar } from './paginas/usuario/Reportar';
import { Verificar2FA } from './paginas/Verificar2FA';

/**
 * Orden de las puertas de entrada:
 * 1. Sin sesión → Ingresar
 * 2. Llegó por invitación o recuperación → crear contraseña
 * 3. Administrador o encargado sin 2FA en esta sesión → verificación en dos pasos
 * 4. Perfil incompleto → datos de contacto
 * 5. La app según el rol
 * La base de datos aplica las mismas reglas por su cuenta: estas puertas
 * son para guiar a la persona, no la seguridad en sí.
 */
function Rutas() {
  const { cargando, sesion, perfil, nivel, necesitaContrasena } = useAuth();

  if (cargando) return <Cargando texto="Abriendo Huellas en la Vía…" />;

  if (!sesion) {
    return (
      <Routes>
        <Route path="/privacidad" element={<Privacidad />} />
        <Route path="/ingresar" element={<Ingresar />} />
        <Route path="*" element={<Navigate to="/ingresar" replace />} />
      </Routes>
    );
  }

  if (!perfil) {
    return (
      <div className="pantalla-acceso">
        <Aviso tipo="error">No se encontró tu perfil. Cierra sesión y vuelve a entrar.</Aviso>
      </div>
    );
  }

  if (necesitaContrasena) return <Restablecer />;

  const requiere2fa = perfil.rol === 'admin' || perfil.rol === 'encargado';
  if (requiere2fa && nivel !== 'aal2') return <Verificar2FA />;

  if (!perfilCompleto(perfil)) {
    return (
      <Routes>
        <Route path="/privacidad" element={<Privacidad />} />
        <Route path="*" element={<CompletarPerfil />} />
      </Routes>
    );
  }

  const inicio = perfil.rol === 'admin' ? '/admin/revision' : perfil.rol === 'encargado' ? '/casos' : '/reportar';

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to={inicio} replace />} />
        <Route path="ingresar" element={<Navigate to={inicio} replace />} />
        <Route path="reportar" element={<Reportar />} />
        <Route path="mis-reportes" element={<MisReportes />} />
        <Route path="mapa" element={<Mapa />} />
        <Route path="perfil" element={<Perfil />} />
        <Route path="privacidad" element={<Privacidad />} />
        {(perfil.rol === 'encargado' || perfil.rol === 'admin') && (
          <Route path="casos/:id" element={<CasoDetalle />} />
        )}
        {perfil.rol === 'encargado' && <Route path="casos" element={<CasosEncargado />} />}
        {perfil.rol === 'admin' && (
          <>
            <Route path="casos" element={<Navigate to="/admin/casos" replace />} />
            <Route path="admin/revision" element={<Revision />} />
            <Route path="admin/casos" element={<CasosAdmin />} />
            <Route path="admin/personas" element={<Personas />} />
          </>
        )}
        <Route path="*" element={<Navigate to={inicio} replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  if (!configuracionCompleta) {
    return (
      <div className="pantalla-acceso">
        <div className="tarjeta-acceso">
          <h1>Falta configurar Supabase</h1>
          <p>
            Copia <code>.env.example</code> como <code>.env</code>, escribe la URL y la clave anon de tu proyecto y
            reinicia <code>npm run dev</code>.
          </p>
        </div>
      </div>
    );
  }
  return (
    <BrowserRouter>
      <Rutas />
    </BrowserRouter>
  );
}
