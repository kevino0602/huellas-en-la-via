import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Perfil } from '../lib/tipos';
import { enlaceInicial } from '../lib/urlInicial';

interface EstadoAuth {
  cargando: boolean;
  sesion: Session | null;
  perfil: Perfil | null;
  /** Nivel de verificación de la sesión: aal1 = contraseña, aal2 = con 2FA */
  nivel: string | null;
  /** Llegó desde un enlace de invitación o recuperación: debe crear contraseña */
  necesitaContrasena: boolean;
  contrasenaCreada: () => void;
  recargar: () => Promise<void>;
  salir: () => Promise<void>;
}

const Contexto = createContext<EstadoAuth | null>(null);

export function perfilCompleto(p: Perfil | null): boolean {
  return Boolean(p && p.nombre.trim() && p.telefono && p.canton_id && p.acepto_privacidad_en);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [sesion, setSesion] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [nivel, setNivel] = useState<string | null>(null);
  const [necesitaContrasena, setNecesitaContrasena] = useState(
    enlaceInicial.esInvitacion || enlaceInicial.esRecuperacion,
  );

  const aplicar = useCallback(async (s: Session | null) => {
    setSesion(s);
    if (!s) {
      setPerfil(null);
      setNivel(null);
      setCargando(false);
      return;
    }
    const [p, aal] = await Promise.all([
      supabase
        .from('perfiles')
        .select('id, nombre, telefono, canton_id, acepto_privacidad_en, rol, advertencias, bloqueado')
        .eq('id', s.user.id)
        .maybeSingle(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    setPerfil((p.data as Perfil | null) ?? null);
    setNivel(aal.data?.currentLevel ?? null);
    setCargando(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => aplicar(data.session));
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setNecesitaContrasena(true);
      // No se llama a Supabase dentro del aviso (recomendación de supabase-js)
      setTimeout(() => void aplicar(s), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [aplicar]);

  const valor = useMemo<EstadoAuth>(
    () => ({
      cargando,
      sesion,
      perfil,
      nivel,
      necesitaContrasena,
      contrasenaCreada: () => setNecesitaContrasena(false),
      recargar: async () => {
        const { data } = await supabase.auth.getSession();
        await aplicar(data.session);
      },
      salir: async () => {
        await supabase.auth.signOut();
        setNecesitaContrasena(false);
      },
    }),
    [cargando, sesion, perfil, nivel, necesitaContrasena, aplicar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAuth(): EstadoAuth {
  const c = useContext(Contexto);
  if (!c) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return c;
}
