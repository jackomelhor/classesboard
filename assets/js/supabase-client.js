(function () {
  const cfg = window.CLASSBOARD_CONFIG || {};
  const key = cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_PUBLISHABLE_KEY || '';

  const hasValidConfig =
    typeof cfg.SUPABASE_URL === 'string' &&
    cfg.SUPABASE_URL.startsWith('https://') &&
    typeof key === 'string' &&
    key.trim().length > 20 &&
    !key.includes('COLE_AQUI');

  window.classboardSupabase = {
    client: null,
    ready: false,
    configError: null,
    debug: {
      hasWindowSupabase: !!window.supabase,
      hasCreateClient: !!window.supabase?.createClient,
      url: cfg.SUPABASE_URL || null,
      keyPrefix: key ? key.slice(0, 18) + '...' : null,
    },
  };

  if (!window.supabase || !window.supabase.createClient) {
    window.classboardSupabase.configError = 'Biblioteca do Supabase não carregou.';
    console.error('[ClassBoard] Supabase library not loaded.', window.classboardSupabase.debug);
    return;
  }

  if (!hasValidConfig) {
    window.classboardSupabase.configError = 'Configuração inválida do Supabase.';
    console.error('[ClassBoard] Invalid config.', window.classboardSupabase.debug);
    return;
  }

  try {
    window.classboardSupabase.client = window.supabase.createClient(
      cfg.SUPABASE_URL,
      key,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );

    window.classboardSupabase.ready = true;
    console.log('[ClassBoard] Supabase client ready.', window.classboardSupabase.debug);
  } catch (error) {
    window.classboardSupabase.configError =
      error?.message || 'Falha ao iniciar o cliente Supabase.';
    console.error('[ClassBoard] Client init failed.', error);
  }
})();
