#!/usr/bin/env bash
# Prueba las migraciones en un PostgreSQL local, sin Docker ni Supabase.
# Uso:  ./scripts/probar-bd/probar.sh
# Requiere psql y un PostgreSQL 15+ al que puedas conectarte.
# Variables opcionales: PGHOST, PGPORT, PGUSER (por defecto postgres).
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$DIR/../.." && pwd)"
BD="huellas_prueba_$$"
export PGUSER="${PGUSER:-postgres}"

createdb "$BD"
trap 'dropdb --if-exists "$BD" >/dev/null 2>&1 || true' EXIT

echo "→ Simulando Supabase"
psql -q -v ON_ERROR_STOP=1 -d "$BD" -f "$DIR/simulacion-supabase.sql"

echo "→ Aplicando migraciones"
for f in "$RAIZ"/supabase/migrations/*.sql; do
  # pg_cron no existe en un PostgreSQL normal; la tarea se prueba llamando la función
  if [[ "$f" == *tareas_programadas* ]]; then
    echo "   (omitida) $(basename "$f")"
    continue
  fi
  echo "   $(basename "$f")"
  psql -q -v ON_ERROR_STOP=1 -d "$BD" -f "$f"
done

echo "→ Ejecutando pruebas"
psql -q -v ON_ERROR_STOP=1 -d "$BD" -f "$DIR/pruebas.sql" 2>&1 | sed 's/^psql:.*NOTICE:  /  /; s/^NOTICE:  /  /'
