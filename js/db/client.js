let supabaseClient = null;

function initSupabase() {
  if (typeof supabase === 'undefined' || !supabase.createClient) {
    supabaseClient = null;
    return false;
  }
  try {
    supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    return true;
  } catch (e) {
    console.error('Supabase init failed', e);
    supabaseClient = null;
    return false;
  }
}

function isCloudReady() {
  return !!supabaseClient;
}

function getSupabaseClient() {
  if (!supabaseClient) throw new Error('Supabase client is not initialized');
  return supabaseClient;
}
