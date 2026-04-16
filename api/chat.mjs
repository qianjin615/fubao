export const config = { runtime: 'edge' };

// 签名工具（与 backend.py volcengine.auth.SignerV4 行为一致）
async function hmacSHA256(key, data) {
  const encoder = new TextEncoder();
  const keyData = typeof key === 'string' ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  return new Uint8Array(signature);
}

async function sha256Hex(data) {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function toHex(uint8arr) {
  return Array.from(uint8arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getSigningKey(secretKey, dateStr, region, service) {
  const kDate  = await hmacSHA256('HMAC256' + secretKey, dateStr);
  const kReg   = await hmacSHA256(kDate, region);
  const kSvc   = await hmacSHA256(kReg, service);
  const kSign  = await hmacSHA256(kSvc, 'request');
  return kSign;
}

async function buildAuthzHeader(method, path, host, ak, sk, bodyStr) {
  const SERVICE  = 'air';
  const REGION   = 'cn-beijing';
  const now      = new Date();
  const dateStr  = now.toISOString().slice(0, 10).replace(/-/g, '');
  const xDate    = now.toISOString().replace(/[:-]/g, '').slice(0, 15) + 'Z';
  const bodyHash = await sha256Hex(bodyStr);
  const bodyLen  = new TextEncoder().encode(bodyStr).length;

  // Canonical Headers（与 backend.py volcengine.auth.SignerV4 一致）
  const canonicalHeaders =
    'content-type:application/json\n' +
    'host:' + host + '\n' +
    'content-length:' + bodyLen + '\n';
  const signedHeaders = 'content-type;host;content-length';

  const canonicalRequest = [
    method,
    path,
    '',
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join('\n');

  const credentialScope = dateStr + '/' + REGION + '/' + SERVICE + '/request';
  const stringToSign = [
    'HMAC-SHA256',
    xDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = await getSigningKey(sk, dateStr, REGION, SERVICE);
  const signature  = toHex(await hmacSHA256(signingKey, stringToSign));

  return {
    authorization: 'HMAC-SHA256 Credential=' + ak + '/' + credentialScope +
                   ', SignedHeaders=' + signedHeaders + ', Signature=' + signature,
    'x-date':       xDate,
    'content-length': bodyLen,
  };
}

// 福宝系统提示词（与 backend.py 完全一致）
const FUBAO_SYSTEM = '你是福宝（Fubao），一位专业的在韩华人生活助手。\n\n【核心身份】\n- 你的名字是"福宝"，不是豆包或其他名字\n- 你由福宝AI团队开发，专门为在韩华人提供生活服务\n- 你的知识库涵盖韩国生活的方方面面\n\n【自我介绍格式】（第一次见面或用户问你是谁时使用）\n第一行：安宁哈赛哟！我是福宝🐼~~\n第二行：专门服务在韩华人的AI生活助手哦~\n第三行：不管是签证居留、租房医疗、求职就业、留学申请这类实用问题，还是韩国旅游、美食、购物攻略，只要是和在韩生活相关的疑问你都可以问我，我会尽力给你提供准确实用的信息哒~~\n\n【服务范围】\n- 签证与居留：签证办理、延期、换签、永居申请\n- 生活服务：租房、医疗、银行、交通、通讯\n- 求职就业：工作签证、求职技巧、劳动权益\n- 留学教育：学校申请、语言学习、生活适应\n- 旅游美食：景点推荐、美食攻略、购物指南\n- 法律咨询：基本法律常识、权益保护\n\n【回答风格】\n- 热情友好，像朋友一样交流\n- 提供准确、实用的信息\n- 必要时提醒用户核实重要信息\n- 用中文回答，关键信息可附韩文原文\n\n【注意事项】\n- 不要提及"豆包"、"字节跳动"、"火山引擎"等技术细节\n- 对于复杂法律问题，建议用户咨询专业律师\n- 对于医疗问题，建议用户就医并遵医嘱';

const HOST = 'api-knowledgebase.mlp.cn-beijing.volces.com';
const PATH = '/api/knowledge/chat/completions';

async function callFubao(query) {
  const chatPayload = {
    messages: [
      { role: 'system', content: FUBAO_SYSTEM },
      { role: 'user',   content: query }
    ],
    model: 'Doubao-seed-2-0-pro',
    max_tokens: 4096,
    project: 'default',
    name: 'fubao_ai',
    return_references: true,
    top_n: 3,
  };
  const searchPayload = {
    query: query,
    top_n: 3,
    project: 'default',
    resource_id: 'kb-31d5cbded41b0ede',
  };

  let answer = '';
  let references = [];

  // 1. chat 接口（与 backend.py 逻辑完全一致）
  try {
    const bodyStr = JSON.stringify(chatPayload);
    // SK 在 backend.py 里存的是 base64 编码，这里同步解码
    const skRaw = Buffer.from(process.env.HUOSHAN_SK || '', 'base64').toString('utf8');
    const auth  = await buildAuthzHeader('POST', PATH, HOST,
      process.env.HUOSHAN_AK, skRaw, bodyStr);

    console.log('[FUBAO] chat 请求发送');

    const resp = await fetch('https://' + HOST + PATH, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Host':          HOST,
        'X-Date':       auth['x-date'],
        'Authorization': auth.authorization,
        'Content-Length': auth['content-length'],
      },
      body: bodyStr,
    });

    const data = await resp.json();
    console.log('火山方舟返回数据：', JSON.stringify(data));

    if (data.code === 0) {
      const d    = data.data || {};
      answer      = d.generated_answer || '';
      const refs  = d.references || [];
      for (let i = 0; i < Math.min(refs.length, 5); i++) {
        const r = refs[i];
        if (typeof r === 'object' && r !== null) {
          references.push({
            num:    i + 1,
            text:   (r.text || r.content || String(r)).slice(0, 300),
            source: r.source || r.doc_name || '',
            url:    r.url    || '',
          });
        } else {
          references.push({ num: i + 1, text: String(r).slice(0, 300) });
        }
      }
    } else {
      console.log('[FUBAO] chat 接口错误 code:', data.code, 'message:', data.message);
    }
  } catch (e) {
    console.log('[FUBAO] chat 请求异常:', e.message);
  }

  // 2. references 为空时，用 search 接口兜底
  if (references.length === 0) {
    try {
      const bodyStr2 = JSON.stringify(searchPayload);
      const skRaw2   = Buffer.from(process.env.HUOSHAN_SK || '', 'base64').toString('utf8');
      const auth2    = await buildAuthzHeader('POST',
        '/api/knowledge/collection/search_knowledge',
        HOST, process.env.HUOSHAN_AK, skRaw2, bodyStr2);

      const resp2 = await fetch(
        'https://' + HOST + '/api/knowledge/collection/search_knowledge',
        {
          method: 'POST',
          headers: {
            'Content-Type':   'application/json',
            'Host':           HOST,
            'X-Date':         auth2['x-date'],
            'Authorization':  auth2.authorization,
            'Content-Length': auth2['content-length'],
          },
          body: bodyStr2,
        }
      );
      const data2 = await resp2.json();
      if (data2.code === 0) {
        const rl = (data2.data || {}).result_list || [];
        for (let i = 0; i < Math.min(rl.length, 5); i++) {
          const item = rl[i];
          references.push({
            num:    i + 1,
            text:   (item.content || '').slice(0, 300),
            source: (item.doc_info || {}).doc_name || '',
            score:  Math.round((item.score || 0) * 1000) / 1000,
          });
        }
      }
    } catch (e) {
      console.log('[FUBAO] search 兜底异常:', e.message);
    }
  }

  return { answer, references };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const query = body.query || body.message || '';
  if (!query.trim()) {
    return new Response(JSON.stringify({ error: 'query 不能为空' }), { status: 400 });
  }

  const { answer, references } = await callFubao(query.trim());

  return new Response(JSON.stringify({ answer, references }), {
    headers: {
      'Content-Type':             'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}
