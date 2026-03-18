(function () {
  const cfg = window.CLASSBOARD_CONFIG || {};
  const hasValidConfig = typeof cfg.SUPABASE_URL === 'string'
    && cfg.SUPABASE_URL.startsWith('https://wtnvkvbotzijzwkssxga.supabase.com')
    && typeof cfg.SUPABASE_ANON_KEY === 'string'
    && !cfg.SUPABASE_ANON_KEY.includes('sb_publishable_3jxlRnppR1mJBi4TaR4JTw_EI0_O6xH');

  window.classboardSupabase = {
    client: null,
    ready: false,
    configError: null,
  };

  if (!window.supabase || !window.supabase.createClient) {
    window.classboardSupabase.configError = 'Biblioteca do Supabase não carregou.';
    return;
  }

  if (!hasValidConfig) {
    window.classboardSupabase.configError = 'Preencha assets/js/config.js com a URL e a anon key do Supabase.';
    return;
  }

  try {
    window.classboardSupabase.client = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );
    window.classboardSupabase.ready = true;
  } catch (error) {
    window.classboardSupabase.configError = error.message || 'Falha ao iniciar o cliente Supabase.';
  }
})();
