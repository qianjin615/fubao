export const config = { runtime: 'edge' };

async function hmacSHA256(key, data) {
  const encoder = new TextEncoder();
  const keyData = typeof key === 'string' ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return new Uint8Array(signature);
}

async function sha256Hash(data) {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function toHex(buffer) {
  return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const { query } = await req.json();
  const ak = process.env.HUOSHAN_AK;
  const sk = process.env.HUOSHAN_SK;
  const accountId = process.env.ACCOUNT_ID;
  const serviceId = process.env.HUOSHAN_KB;

  const host = 'api-knowledgebase.mlp.cn-beijing.volces.com';
  const path = '/api/knowledge/chat/completions';
  const service = 'ml_maas';
  const region = 'cn-beijing';

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

  const body = JSON.stringify({
    messages: [{ role: 'user', content: query }],
    model: 'kb-service',
    return_references: true,
    top_n: 5,
    service_id: serviceId,
  });

  const bodyHash = await sha256Hash(body);

  const canonicalHeaders = content-type:application/json\nhost:System.Management.Automation.Internal.Host.InternalHost\nx-account-id:\nx-date:\n;
  const signedHeaders = 'content-type;host;x-account-id;x-date';
  const canonicalRequest = POST\n\n\n\n;

  const credentialScope = ${dateStr}///request;
  const canonicalRequestHash = await sha256Hash(canonicalRequest);
  const stringToSign = HMAC-SHA256\n\n\n;

  const signingKey1 = await hmacSHA256(sk, dateStr);
  const signingKey2 = await hmacSHA256(signingKey1, region);
  const signingKey3 = await hmacSHA256(signingKey2, service);
  const signingKey4 = await hmacSHA256(signingKey3, 'request');
  const signature = toHex(await hmacSHA256(signingKey4, stringToSign));

  const authorization = HMAC-SHA256 Credential=/, SignedHeaders=, Signature=;

  try {
    const response = await fetch(https://System.Management.Automation.Internal.Host.InternalHost, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': host,
        'X-Account-Id': accountId,
        'X-Date': timeStr,
        'Authorization': authorization,
      },
      body,
    });

    const data = await response.json();
    const answer = data?.generated_answer || data?.choices?.[0]?.message?.content || '暂时无法获取回答，请稍后重试。';
    const refs = (data?.references || []).map(r => r.doc_name || r.title || '').filter(Boolean);

    return new Response(JSON.stringify({ answer, refs }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}