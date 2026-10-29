# Huellas en la Vía

App web instalable (PWA) para reportar animales muertos en las calles del Ecuador, revisar que los reportes sean reales y coordinar a los encargados que los levantan.

**Huellas en la Vía by KPSB**

- **Frontend:** React 19 + TypeScript + Vite, instalable en el celular (PWA), con cámara, GPS y modo sin señal.
- **Backend:** Supabase (PostgreSQL con Row Level Security, Auth con 2FA, Storage, Edge Functions en Deno, pg_cron).
- **Hosting:** Cloudflare Pages (gratis).

El diseño completo (roles, estados, seguridad y decisiones) está en [`docs/DISENO.md`](docs/DISENO.md).

---

## Estructura

```
src/
  auth/AuthProvider.tsx       sesión, perfil y nivel de 2FA
  componentes/                cámara, mapa, fotos privadas, captcha, menú
  lib/                        Supabase, cola sin señal, GPS, fotos, tipos
  paginas/
    usuario/                  Reportar, Mis reportes, Mapa
    encargado/                Casos de su zona
    admin/                    Revisión, Casos, Personas
    CasoDetalle.tsx           detalle y acciones de un caso (encargado y admin)
supabase/
  migrations/                 esquema, cantones, funciones, seguridad, fotos, cron
  functions/                  invitar-encargado, eliminar-cuenta
scripts/
  probar-bd/                  pruebas de la base en un PostgreSQL local
  generar-iconos.py           íconos de la app
public/_headers               cabeceras de seguridad para Cloudflare
```

---

## Puesta en marcha

### 1. Supabase

1. Crea un proyecto gratis en [supabase.com](https://supabase.com). Elige la región más cercana (por ejemplo São Paulo).
2. En tu computadora, dentro de esta carpeta:

   ```bash
   npm install
   npx supabase login
   npx supabase init            # crea supabase/config.toml (no toca las migraciones)
   npx supabase link --project-ref TU_PROJECT_REF
   npx supabase db push         # crea tablas, cantones, reglas y funciones
   ```

   Si `db push` falla en `tareas_programadas`, activa **pg_cron** en *Database → Extensions* y vuelve a ejecutarlo.

3. Despliega las funciones y configura la URL de la app:

   ```bash
   npx supabase functions deploy invitar-encargado
   npx supabase functions deploy eliminar-cuenta
   npx supabase secrets set APP_URL=https://tu-dominio.pages.dev
   ```

4. En el panel de Supabase, **Authentication**:
   - **URL Configuration:** *Site URL* = la URL de tu app. En *Redirect URLs* agrega la misma URL, `https://tu-dominio/restablecer` y `http://localhost:5173/**` para desarrollo.
   - **Providers → Email:** deja activada la confirmación de correo. Sube la longitud mínima de contraseña a 10.
   - **Providers → Google:** actívalo con un *Client ID* de Google Cloud (pantalla de consentimiento + credencial OAuth web; la URL de retorno te la da Supabase).
   - **Multi-Factor:** verifica que TOTP esté habilitado (viene activo por defecto).
   - **SMTP:** el correo incluido de Supabase solo sirve para pruebas y tiene límites muy bajos. Conecta un SMTP propio (Resend o Brevo tienen planes gratis) para que lleguen las confirmaciones e invitaciones.
   - **Attack Protection (opcional):** activa Turnstile con la clave secreta de Cloudflare y pon la clave pública en `VITE_TURNSTILE_SITE_KEY`.

### 2. Tu cuenta de administrador

1. Abre la app y crea tu cuenta normalmente.
2. En Supabase → *SQL Editor* ejecuta:

   ```sql
   update public.perfiles set rol = 'admin'
   where id = (select id from auth.users where email = 'tu-correo@gmail.com');
   ```

3. Vuelve a entrar: la app te pedirá configurar la verificación en dos pasos. Desde **Personas** podrás invitar encargados y nombrar otros administradores.

### 3. Correr en tu computadora

```bash
cp .env.example .env    # y llena VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev             # http://localhost:5173
```

La cámara y el GPS funcionan en `localhost`. Para probar en tu celular necesitas HTTPS: lo más simple es desplegar en Cloudflare Pages.

### 4. Publicar en Cloudflare Pages

1. Sube el proyecto a un repositorio de GitHub.
2. En Cloudflare → *Workers & Pages* → *Create* → *Pages* → conecta el repositorio.
3. Configuración de compilación:
   - Comando: `npm run build`
   - Carpeta de salida: `dist`
   - Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY` (opcional) y `NODE_VERSION=22`.
4. Cada vez que hagas *push* a GitHub, Cloudflare publica la nueva versión sola.

---

## Cambiar las reglas sin tocar código

Los números del negocio viven en la tabla `public.configuracion`:

| Columna | Por defecto | Qué controla |
|---|---|---|
| `duplicados_metros` | 100 | Distancia para sugerir que dos reportes son el mismo animal |
| `duplicados_horas` | 6 | Diferencia de horas entre reportes en revisión para sugerirlos como duplicados |
| `limite_reportes_dia` | 5 | Reportes por usuario en 24 horas |
| `advertencias_para_bloqueo` | 3 | Reportes falsos que bloquean una cuenta |
| `horas_auto_soltar` | 24 | Horas antes de que un caso tomado vuelva solo a pendiente |
| `dias_maximos_reporte` | 7 | Antigüedad máxima de una foto guardada sin señal |
| `dias_mapa` | 30 | Días de casos que ve el usuario en su mapa |

```sql
update public.configuracion set limite_reportes_dia = 10;
```

Lo del lado del celular (tamaño de foto, precisión de GPS recomendada, motivos de rechazo) está en `src/config.ts`.

---

## Pruebas de la base de datos

`scripts/probar-bd/` levanta una simulación mínima de Supabase en un PostgreSQL normal y recorre el flujo completo con cada rol (70 comprobaciones de permisos y estados):

```bash
# con PostgreSQL 15+ instalado y un usuario que pueda crear bases
PGUSER=postgres npm run probar-bd
```

Corre esto cada vez que cambies una migración.

---

## Mantenimiento

- **Cambios en la base:** crea un archivo nuevo en `supabase/migrations/` (nunca edites uno ya aplicado) y ejecuta `npx supabase db push`. Si creas funciones nuevas, concédeles permiso con `grant execute ... to authenticated`, porque por seguridad no quedan abiertas por defecto.
- **Tipos automáticos:** `npx supabase gen types typescript --linked > src/lib/basedatos.ts`.
- **Dependencias:** `npm outdated` cada pocos meses; actualiza, compila y prueba.
- **Respaldos:** el plan gratis de Supabase no incluye copias descargables. Haz una de vez en cuando con `npx supabase db dump -f respaldo.sql`.
- **Plan gratis de Supabase:** el proyecto se pausa tras una semana sin uso. Se reactiva desde el panel.
