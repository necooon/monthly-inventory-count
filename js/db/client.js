function throwIfError(error) {
  if (error) throw error;
}

function initSupabase() {
  const sync = CheckStock.state.sync;
  if (typeof supabase === 'undefined' || !supabase.createClient) {
    sync.supabaseClient = null;
    return false;
  }
  try {
    const config = CheckStock.constants.SUPABASE_CONFIG;
    sync.supabaseClient = supabase.createClient(config.url, config.anonKey);
    return true;
  } catch (e) {
    console.error('Supabase init failed', e);
    sync.supabaseClient = null;
    return false;
  }
}

function isCloudReady() {
  return !!(CheckStock.state && CheckStock.state.sync && CheckStock.state.sync.supabaseClient);
}

function getSupabaseClient() {
  const client = CheckStock.state.sync.supabaseClient;
  if (!client) throw new Error('Supabase client is not initialized');
  return client;
}

async function dbSelect(table, columns, configure) {
  let query = getSupabaseClient().from(table).select(columns);
  if (configure) query = configure(query);
  const { data, error } = await query;
  throwIfError(error);
  return data || [];
}

async function dbUpsert(table, rows, onConflict) {
  if (!rows.length) return;
  const { error } = await getSupabaseClient().from(table).upsert(rows, { onConflict });
  throwIfError(error);
}

async function dbInsert(table, rows) {
  if (!rows.length) return;
  const { error } = await getSupabaseClient().from(table).insert(rows);
  throwIfError(error);
}

async function dbUpdate(table, values, configure) {
  let query = getSupabaseClient().from(table).update(values);
  if (configure) query = configure(query);
  const { error } = await query;
  throwIfError(error);
}

async function dbDelete(table, configure) {
  let query = getSupabaseClient().from(table).delete();
  if (configure) query = configure(query);
  const { data, error } = await query;
  throwIfError(error);
  return data || [];
}
