// Pega aquí los datos de tu proyecto de Supabase (Project Settings > API).
// La clave "anon" es pública: la seguridad la dan las políticas RLS del esquema.
// Nunca pongas aquí la clave "service_role".
window.APP_CONFIG = {
  SUPABASE_URL: 'https://tturhznpvccrdparxfoj.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_zeUPZZ3wavgLS399DL9KNg_xM4734Rq',
  OFFLINE_GRACE_DAYS: 2,   // días que la app funciona sin validar la licencia en línea (ajustado a 2 días para prueba interna D3)
  RECHECK_MINUTES: 15      // cada cuánto revalida la licencia mientras está abierta
};
