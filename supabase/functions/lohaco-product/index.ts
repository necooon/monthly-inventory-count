import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { fetchProductMeta } from '../_shared/productMetaService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  try {
    const body = await req.json();
    const url = String(body?.url || '').trim();
    if (!url) return jsonResponse({ error: 'url is required' }, 400);

    const meta = await fetchProductMeta(url);
    if (!meta) return jsonResponse({ error: 'Product not found' }, 404);
    return jsonResponse(meta);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
});
