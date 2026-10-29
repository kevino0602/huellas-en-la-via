import { Link } from 'react-router';

// BORRADOR. Revísalo y complétalo antes de publicar la app (Ley Orgánica de
// Protección de Datos Personales del Ecuador). Los datos entre [corchetes]
// son tuyos de completar.
export function Privacidad() {
  return (
    <div className="pagina texto-largo">
      <h1>Política de privacidad</h1>
      <p className="ayuda">Versión borrador · Huellas en la Vía by KPSB</p>

      <h2>Quién trata tus datos</h2>
      <p>
        Responsable: [nombre del responsable], [correo de contacto]. Huellas en la Vía es una iniciativa para que los
        animales que mueren en las calles del Ecuador sean levantados y no queden olvidados.
      </p>

      <h2>Qué datos pedimos y para qué</h2>
      <ul>
        <li>
          <strong>Correo, nombre, celular y cantón:</strong> para crear tu cuenta y que cada reporte tenga una persona
          responsable, lo que ayuda a evitar reportes falsos.
        </li>
        <li>
          <strong>Foto y ubicación del lugar:</strong> solo en el momento en que haces un reporte, para que un encargado
          pueda llegar. La foto se guarda sin los datos ocultos del celular (ubicación de tu casa, modelo del teléfono).
        </li>
      </ul>
      <p>No usamos tus datos para publicidad ni los vendemos.</p>

      <h2>Quién los ve</h2>
      <ul>
        <li>Los administradores ven tus datos de contacto para revisar tus reportes.</li>
        <li>Los encargados ven la foto y la ubicación del animal, pero no quién lo reportó.</li>
        <li>Los demás usuarios solo ven en el mapa que hay un caso en una ubicación, sin datos tuyos.</li>
      </ul>

      <h2>Dónde se guardan</h2>
      <p>
        En servidores de Supabase (base de datos y fotos) con cifrado en tránsito y acceso restringido por reglas de
        seguridad para cada rol. [Indicar región del servidor.]
      </p>

      <h2>Cuánto tiempo</h2>
      <p>
        Tus datos de contacto, mientras tengas la cuenta. Los reportes aprobados se conservan como registro de los casos
        atendidos; si eliminas tu cuenta, quedan sin tu nombre. [Definir plazo de conservación de fotos.]
      </p>

      <h2>Tus derechos</h2>
      <p>
        Puedes acceder, corregir y eliminar tus datos. Corrige tus datos en <Link to="/perfil">Perfil</Link> y elimina
        tu cuenta desde la misma página. Para otras solicitudes escribe a [correo de contacto].
      </p>
    </div>
  );
}
