(function () {
  const cfg = window.CLASSBOARD_CONFIG || {};
  const publicKey = cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_PUBLISHABLE_KEY || cfg.SUPABASE_PUBLIC_KEY || '';

  const validConfig =
    typeof cfg.SUPABASE_URL === 'string' &&
    cfg.SUPABASE_URL.startsWith('https://') &&
    typeof publicKey === 'string' &&
    publicKey.trim().length > 20 &&
    !publicKey.includes('COLE_AQUI');

  window.classboardSupabase = {
    client: null,
    ready: false,
    configError: null,
  };

  if (!window.supabase || !window.supabase.createClient) {
    window.classboardSupabase.configError = 'Serviço de conexão indisponível.';
    return;
  }

  if (!validConfig) {
    window.classboardSupabase.configError = 'Serviço temporariamente indisponível.';
    return;
  }

  try {
    window.classboardSupabase.client = window.supabase.createClient(cfg.SUPABASE_URL, publicKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    window.classboardSupabase.ready = true;
  } catch (error) {
    window.classboardSupabase.configError = error?.message || 'Falha ao iniciar o serviço.';
  }
})();
