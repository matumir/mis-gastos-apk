-- Mis Gastos — recordatorios en la versión web (iPhone y computadora) con Web Push.
-- Usa el MISMO proyecto de Supabase que ARAC Partidos, con sus propias tablas y funciones
-- (todo lo de Mis Gastos empieza con "misgastos_"), así que no toca nada de ARAC.
-- Pegar entero en Supabase › SQL Editor › New query › Run. Se puede correr más de una vez.
--
-- En el APK los recordatorios los programa el propio teléfono y no usan nada de esto.
-- En la web el teléfono no puede programarlos: los manda el servidor. Cada teléfono que los
-- activa deja acá su "suscripción" (una dirección anónima para mandarle avisos, sin ningún
-- dato de gastos) y su zona horaria; la Edge Function "misgastos-recordatorio" le manda:
--   · el recordatorio diario a las 21 (hora del teléfono);
--   · el día 1 a las 10, el aviso de que está el resumen del mes.

-- =========================================================
-- 1. Suscripciones (una por teléfono/navegador)
-- =========================================================
create table if not exists public.misgastos_push (
  endpoint            text        primary key,
  p256dh              text        not null,
  auth                text        not null,
  zona                text        not null default 'America/Argentina/Buenos_Aires',
  ultimo_recordatorio date,        -- día (en la zona del teléfono) del último recordatorio mandado
  ultimo_resumen      text,        -- mes 'AAAA-MM' del último aviso de resumen mandado
  creado              timestamptz not null default now()
);
-- Desde la app no se toca la tabla directo: sólo con las dos funciones de abajo.
alter table public.misgastos_push enable row level security;
revoke all on public.misgastos_push from anon, authenticated;

-- Activar los recordatorios en este teléfono. Mis Gastos no tiene cuentas: la puede llamar
-- cualquiera con la clave pública, y por eso sólo acepta suscripciones con forma válida.
create or replace function public.misgastos_guardar_push(p_endpoint text, p_p256dh text, p_auth text, p_zona text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zona text := 'America/Argentina/Buenos_Aires';
begin
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(length(p_p256dh), 0) not between 20 and 200
     or coalesce(length(p_auth), 0) not between 8 and 100 then
    raise exception 'Suscripción inválida';
  end if;
  if exists (select 1 from pg_catalog.pg_timezone_names where name = p_zona) then
    v_zona := p_zona;
  end if;
  insert into public.misgastos_push (endpoint, p256dh, auth, zona)
  values (p_endpoint, p_p256dh, p_auth, v_zona)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, zona = excluded.zona;
end;
$$;

-- Desactivarlos
create or replace function public.misgastos_borrar_push(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.misgastos_push where endpoint = p_endpoint;
$$;

revoke all on function public.misgastos_guardar_push(text, text, text, text) from public;
revoke all on function public.misgastos_borrar_push(text) from public;
grant execute on function public.misgastos_guardar_push(text, text, text, text) to anon, authenticated;
grant execute on function public.misgastos_borrar_push(text) to anon, authenticated;

-- A quiénes les toca un aviso ahora, y los marca como mandados (así nunca sale dos veces,
-- aunque el envío corra cada hora). Usa "a partir de" la hora y no "a la" hora: si una
-- corrida se saltea, el aviso sale en la siguiente.
-- La usa la Edge Function con la clave de servicio; la app no puede llamarla.
create or replace function public.misgastos_push_tomar()
returns table (o_endpoint text, o_p256dh text, o_auth text, o_tipo text, o_fecha date)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with marcados as (
    update public.misgastos_push s
       set ultimo_recordatorio = (now() at time zone s.zona)::date
     where extract(hour from now() at time zone s.zona) >= 21
       and (s.ultimo_recordatorio is null or s.ultimo_recordatorio < (now() at time zone s.zona)::date)
    returning s.endpoint, s.p256dh, s.auth, (now() at time zone s.zona)::date as fecha
  )
  select m.endpoint, m.p256dh, m.auth, 'recordatorio'::text, m.fecha from marcados m;

  return query
  with marcados as (
    update public.misgastos_push s
       set ultimo_resumen = to_char(now() at time zone s.zona, 'YYYY-MM')
     where extract(day from now() at time zone s.zona) = 1
       and extract(hour from now() at time zone s.zona) >= 10
       and s.ultimo_resumen is distinct from to_char(now() at time zone s.zona, 'YYYY-MM')
    returning s.endpoint, s.p256dh, s.auth, (now() at time zone s.zona)::date as fecha
  )
  select m.endpoint, m.p256dh, m.auth, 'resumen'::text, m.fecha from marcados m;
end;
$$;
revoke all on function public.misgastos_push_tomar() from public, anon, authenticated;
grant execute on function public.misgastos_push_tomar() to service_role;

-- =========================================================
-- 2. Envío: cada hora, a los 2 minutos. La función decide a quién le toca.
--    Usa la misma clave compartida que ARAC ('arac_clave_push', ya guardada en Vault).
-- =========================================================
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'misgastos-recordatorio';
select cron.schedule('misgastos-recordatorio', '2 * * * *', $$
  select net.http_post(
    url     := 'https://jvclrktwezisvuljemgi.supabase.co/functions/v1/misgastos-recordatorio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-arac-clave', (select decrypted_secret from vault.decrypted_secrets where name = 'arac_clave_push')
    ),
    body    := '{}'::jsonb
  );
$$);

-- Para ver si está andando:
--   select endpoint, zona, ultimo_recordatorio, ultimo_resumen from public.misgastos_push;
--   select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'misgastos-recordatorio') order by start_time desc limit 5;
