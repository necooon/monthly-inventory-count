function throwIfError(error) {
  if (error) throw error;
}

function looksLikeAnonKey(key) {
  const token = String(key || '').trim();
  return token.split('.').length === 3 && token.startsWith('eyJ');
}

function decodeJwtPayload(token) {
  const part = String(token || '').split('.')[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    return JSON.parse(atob(padded));
  } catch (e) {
    return null;
  }
}

function normalizeSupabaseUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) throw new Error('Project URL を入力してください。');
  let parsed;
  try {
    parsed = new URL(trimmed.includes('://') ? trimmed : 'https://' + trimmed);
  } catch (e) {
    throw new Error('https://xxxx.supabase.co の形式で入力してください。');
  }
  if (!parsed.hostname.endsWith('.supabase.co')) {
    throw new Error('https://xxxx.supabase.co の形式で入力してください。');
  }
  return parsed.origin;
}

function supabaseProjectRef(url) {
  try {
    return new URL(url).hostname.split('.')[0] || '';
  } catch (e) {
    return '';
  }
}

function getActiveSupabaseConfig() {
  const override = loadSupabaseOverride();
  if (override) return { ...override, source: 'override' };
  const fallback = CheckStock.constants.SUPABASE_CONFIG;
  return { url: fallback.url, anonKey: fallback.anonKey, source: 'default' };
}

function hasSupabaseOverride() {
  return !!loadSupabaseOverride();
}

function formatSupabaseReconnectError(error) {
  const msg = String((error && (error.message || error.error_description)) || error || '');
  const code = error && error.code;
  if (/Invalid API key|JWT|401/i.test(msg) || code === 'PGRST301') {
    return 'anon key がこのプロジェクトと一致しません。Project Settings → API の anon public を貼ってください。';
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return 'プロジェクトに到達できません。URL を確認してください。';
  }
  if (/Could not find the table|does not exist|schema cache/i.test(msg) || code === 'PGRST205' || code === '42P01') {
    return 'テーブルがありません。新しいプロジェクトの SQL Editor で supabase/setup.sql を実行してください。';
  }
  return msg ? '接続に失敗しました。（' + msg + '）' : '接続に失敗しました。';
}

async function probeSupabase(client) {
  const { error } = await client.from('items').select('id', { count: 'exact', head: true });
  throwIfError(error);
}

function buildSupabaseClient(config) {
  if (typeof supabase === 'undefined' || !supabase.createClient) return null;
  return supabase.createClient(config.url, config.anonKey);
}

function parseSupabaseConfig(rawUrl, rawKey) {
  const config = {
    url: normalizeSupabaseUrl(rawUrl),
    anonKey: String(rawKey || '').trim()
  };
  if (!looksLikeAnonKey(config.anonKey)) {
    throw new Error('anon public key を貼り付けてください。');
  }
  const urlRef = supabaseProjectRef(config.url);
  const payload = decodeJwtPayload(config.anonKey);
  const keyRef = payload && payload.ref;
  if (urlRef && keyRef && urlRef !== keyRef) {
    throw new Error('URL と anon key のプロジェクトが一致しません。');
  }
  return config;
}

async function applySupabaseConfig(config, persistOverride) {
  const previous = CheckStock.state.sync.supabaseClient;
  stopCloudChannel();
  const client = buildSupabaseClient(config);
  if (!client) throw new Error('Supabase SDK が読み込まれていません。');
  try {
    await probeSupabase(client);
  } catch (e) {
    CheckStock.state.sync.supabaseClient = previous;
    if (previous) subscribeCloudChannel();
    throw new Error(formatSupabaseReconnectError(e));
  }
  const fallback = CheckStock.constants.SUPABASE_CONFIG;
  const matchesDefault = config.url === fallback.url && config.anonKey === fallback.anonKey;
  if (persistOverride && !matchesDefault) persistSupabaseOverride(config);
  else clearSupabaseOverride();
  CheckStock.state.sync.supabaseClient = client;
  cloudHydrated = false;
  lastPushedCloudSnapshot = null;
  await startCloudListener();
}

function initSupabase() {
  const sync = CheckStock.state.sync;
  try {
    const client = buildSupabaseClient(getActiveSupabaseConfig());
    sync.supabaseClient = client;
    return !!client;
  } catch (e) {
    console.error('Supabase init failed', e);
    sync.supabaseClient = null;
    return false;
  }
}

async function reconnectSupabase(rawUrl, rawKey) {
  await applySupabaseConfig(parseSupabaseConfig(rawUrl, rawKey), true);
}

async function resetSupabaseConnection() {
  const fallback = CheckStock.constants.SUPABASE_CONFIG;
  await applySupabaseConfig({ url: fallback.url, anonKey: fallback.anonKey }, false);
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
