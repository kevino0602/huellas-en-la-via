-- =====================================================================
-- Huellas en la Vía · Tareas programadas
-- Cada 15 minutos devuelve a "pendiente" los casos que un encargado
-- tomó y no finalizó dentro de configuracion.horas_auto_soltar.
-- Requiere la extensión pg_cron (en Supabase: Database → Extensions).
-- =====================================================================

create extension if not exists pg_cron;

select cron.schedule(
  'liberar-casos-vencidos',
  '*/15 * * * *',
  $$select public.liberar_casos_vencidos();$$
);
