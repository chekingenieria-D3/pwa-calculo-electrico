-- =====================================================================
-- Licencias para la calculadora NOM-001. Ejecutar completo en
-- Supabase > SQL Editor.
-- =====================================================================

-- ---------- Tablas ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  nombre      text,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.licenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references public.profiles(id) on delete cascade,
  plan         text not null default 'estandar',
  status       text not null default 'active' check (status in ('active','suspended','revoked')),
  expires_at   timestamptz,                       -- null = sin vencimiento
  max_devices  int  not null default 2 check (max_devices between 1 and 20),
  notas        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  device_id   text not null,
  nombre      text,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  revoked     boolean not null default false,     -- bloqueado por el administrador
  unique (user_id, device_id)
);

create table public.device_releases (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  released_at  timestamptz not null default now()
);

-- ---------- Perfil automático al registrarse ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nombre)
  values (new.id, new.email, new.raw_user_meta_data ->> 'nombre');

  -- Prueba gratis: quita los dos guiones del inicio para dar 7 días
  -- a cada cuenta nueva.
  -- insert into public.licenses (user_id, plan, expires_at, max_devices)
  -- values (new.id, 'prueba', now() + interval '7 days', 1);

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger licenses_touch
  before update on public.licenses
  for each row execute function public.touch_updated_at();

-- ---------- Administrador ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- ---------- Seguridad por filas (RLS) ----------
alter table public.profiles        enable row level security;
alter table public.licenses        enable row level security;
alter table public.devices         enable row level security;
alter table public.device_releases enable row level security;

-- profiles: cada quien ve el suyo; el admin ve y edita todos
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy profiles_admin_update on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- licenses: cada quien ve la suya; solo el admin escribe
create policy licenses_select on public.licenses for select
  using (user_id = auth.uid() or public.is_admin());
create policy licenses_admin_insert on public.licenses for insert
  with check (public.is_admin());
create policy licenses_admin_update on public.licenses for update
  using (public.is_admin()) with check (public.is_admin());
create policy licenses_admin_delete on public.licenses for delete
  using (public.is_admin());

-- devices: cada quien ve los suyos; solo el admin modifica directo
-- (los usuarios registran y liberan mediante las funciones de abajo)
create policy devices_select on public.devices for select
  using (user_id = auth.uid() or public.is_admin());
create policy devices_admin_update on public.devices for update
  using (public.is_admin()) with check (public.is_admin());
create policy devices_admin_delete on public.devices for delete
  using (public.is_admin());

create policy releases_admin_select on public.device_releases for select
  using (public.is_admin());

-- ---------- Validar licencia y registrar dispositivo ----------
create or replace function public.check_license(p_device_id text, p_device_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_lic   public.licenses%rowtype;
  v_dev   public.devices%rowtype;
  v_count int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_auth');
  end if;
  if p_device_id is null or length(p_device_id) < 8 then
    return jsonb_build_object('ok', false, 'reason', 'bad_device');
  end if;

  select * into v_lic from public.licenses where user_id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_license', 'server_time', now());
  end if;
  if v_lic.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'suspended', 'server_time', now());
  end if;
  if v_lic.expires_at is not null and v_lic.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired',
                              'expires_at', v_lic.expires_at, 'server_time', now());
  end if;

  select * into v_dev from public.devices where user_id = v_uid and device_id = p_device_id;
  if found then
    if v_dev.revoked then
      return jsonb_build_object('ok', false, 'reason', 'device_revoked', 'server_time', now());
    end if;
    update public.devices
       set last_seen = now(), nombre = coalesce(p_device_name, nombre)
     where id = v_dev.id;
  else
    select count(*) into v_count from public.devices where user_id = v_uid and not revoked;
    if v_count >= v_lic.max_devices then
      return jsonb_build_object(
        'ok', false, 'reason', 'device_limit', 'max_devices', v_lic.max_devices,
        'server_time', now(),
        'devices', coalesce((select jsonb_agg(jsonb_build_object(
                      'id', d.id, 'nombre', d.nombre, 'last_seen', d.last_seen)
                      order by d.last_seen desc)
                    from public.devices d where d.user_id = v_uid and not d.revoked), '[]'::jsonb));
    end if;
    insert into public.devices (user_id, device_id, nombre) values (v_uid, p_device_id, p_device_name);
  end if;

  return jsonb_build_object('ok', true, 'plan', v_lic.plan, 'expires_at', v_lic.expires_at,
                            'max_devices', v_lic.max_devices, 'server_time', now());
end $$;

-- ---------- Liberar un dispositivo propio (máx. 3 veces cada 30 días) ----------
create or replace function public.release_device(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_n   int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_auth');
  end if;
  select count(*) into v_n from public.device_releases
   where user_id = v_uid and released_at > now() - interval '30 days';
  if v_n >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'release_limit');
  end if;
  delete from public.devices where id = p_id and user_id = v_uid and not revoked;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  insert into public.device_releases (user_id) values (v_uid);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Permisos de las funciones ----------
revoke execute on function public.check_license(text, text) from public, anon;
revoke execute on function public.release_device(uuid)      from public, anon;
grant  execute on function public.check_license(text, text) to authenticated;
grant  execute on function public.release_device(uuid)      to authenticated;

-- ---------- Tu primer administrador ----------
-- 1) Crea tu cuenta desde la app. 2) Ejecuta esto con tu correo:
-- update public.profiles set is_admin = true where email = 'tu@correo.com';
