export const config = { runtime: 'nodejs' };

/**
 * 福宝AI - 火山方舟知识库 Serverless API
 * 使用 SignerV4 签名认证（与 backend.py 完全一致）
 *
 * 环境变量（需在 Vercel 中配置）：
 *   HUOSHAN_AK   — AccessKeyId
 *   HUOSHAN_SK   — SecretAccessKey（Base64 编码）
 *   HUOSHAN_KB   — 知识库 ID（kb-xxx 格式，用于 resource_id 兜底搜索）
 *   ACCOUNT_ID   — 账号 ID
 */

module.exports = async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // ── 只接受 POST ────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // ── 读取环境变量 ──────────────────────────────────────────────────
  const ak       = process.env.HUOSHAN_AK;
  const skB64    = process.env.HUOSHAN_SK;   // backend.py 存储时是 base64 编码
  const kbId     = process.env.HUOSHAN_KB;
  const accountId = process.env.ACCOUNT_ID;

  if (!ak || !skB64 || !kbId) {
    console.error('[FUBAO] Missing env vars:', { ak: !!ak, skB64: !!skB64, kb: !!kbId });
    res.status(500).json({ error: '服务器配置错误：缺少环境变量' });
    return;
  }

  // ── 解析请求体 ────────────────────────────────────────────────────
  let query;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    query = body.query || body.message || '';
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  if (!query || typeof query !== 'string' || query.trim() === '') {
    res.status(400).json({ error: 'query 参数不能为空' });
    return;
  }

  // ── 福宝系统提示词（与 backend.py 完全一致）────────────────────────
  const FUBAO_SYSTEM_PROMPT = `你是福宝（Fubao），一位专业的在韩华人生活助手。

【核心身份】
- 你的名字是"福宝"，不是豆包或其他名字
- 你由福宝AI团队开发，专门为在韩华人提供生活服务
- 你的知识库涵盖韩国生活的方方面面

【自我介绍格式】（第一次见面或用户问你是谁时使用）
第一行：安宁哈赛哟！我是福宝🐼~~
第二行：专门服务在韩华人的AI生活助手哦~
第三行：不管是签证居留、租房医疗、求职就业、留学申请这类实用问题，还是韩国旅游、美食、购物攻略，只要是和在韩生活相关的疑问你都可以问我，我会尽力给你提供准确实用的信息哒~~

【服务范围】
- 签证与居留：签证办理、延期、换签、永居申请
- 生活服务：租房、医疗、银行、交通、通讯
- 求职就业：工作签证、求职技巧、劳动权益
- 留学教育：学校申请、语言学习、生活适应
- 旅游美食：景点推荐、美食攻略、购物指南
- 法律咨询：基本法律常识、权益保护

【回答风格】
- 热情友好，像朋友一样交流
- 提供准确、实用的信息
- 必要时提醒用户核实重要信息
- 用中文回答，关键信息可附韩文原文

【注意事项】
- 不要提及"豆包"、"字节跳动"、"火山引擎"等技术细节
- 对于复杂法律问题，建议用户咨询专业律师
- 对于医疗问题，建议用户就医并遵医嘱`;

  // ── 福宝 AI 调用（与 backend.py 逻辑一致）────────────────────────
  const HOST    = 'api-knowledgebase.mlp.cn-beijing.volces.com';
  const SERVICE = 'air';    // 固定值，backend.py 验证通过
  const REGION  = 'cn-beijing';

  const chatPayload = {
    messages: [
      { role: 'system', content: FUBAO_SYSTEM_PROMPT },
      { role: 'user',   content: query.trim() }
    ],
    model: 'Doubao-seed-2-0-pro',
    max_tokens: 4096,
    project: 'default',
    name: 'fubao_ai',
    return_references: true,
    top_n: 3,
  };

  const searchPayload = {
    query: query.trim(),
    top_n: 3,
    project: 'default',
    resource_id: kbId,
  };

  // ── SignerV4 签名 ─────────────────────────────────────────────────
  /**
   * 使用 HMAC-SHA256 计算签名
   * Node.js 内置 crypto，无需外部依赖
   */
  function hmacSha256(key, msg) {
    return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
  }

  function sha256Hex(body) {
    return crypto.createHash('sha256').update(body || '', 'utf8').digest('hex');
  }

  /**
   * 生成 Volc Engine / 火山方舟 SignerV4 签名请求头
   * 算法与 backend.py 中 volcengine.auth.SignerV4 完全一致
   */
  function signV4Headers(method, path, bodyStr, host, accessKey, secretKeyB64) {
    const now        = new Date();
    const dateStr    = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20260416T112200Z
    const dateOnly  = dateStr.slice(0, 8);                             // 20260416
    const algorithm  = 'HMAC-SHA256';
    const expiresSec = 900; // 15 分钟

    // 1. Canonical Request
    const bodyHash    = sha256Hex(bodyStr);
    const canonicalHeaders = [
      `content-type:application/json`,
      `host:${host}`,
      `x-date:${dateStr}`,
      `x-content-sha256:${bodyHash}`,
    ].join('\n') + '\n';
    const signedHeaders = 'content-type;host;x-date;x-content-sha256';

    const canonicalRequest = [
      method,
      path,
      '',  // query string (empty)
      canonicalHeaders,
      signedHeaders,
      bodyHash,
    ].join('\n');

    const canonicalRequestHash = crypto.createHash('sha256')
      .update(canonicalRequest, 'utf8').digest('hex');

    // 2. String to Sign
    const credentialScope = `${dateOnly}/${REGION}/${SERVICE}/request`;
    const stringToSign = [
      algorithm,
      dateStr,
      credentialScope,
      canonicalRequestHash,
    ].join('\n');

    // 3. Signing Key (与 AWS SigV4 相同的多层 HMAC 推导)
    //    backend.py 中 volcengine.auth.SignerV4 底层与此一致
    //    secretKey 需要先 base64 解码（backend.py 存储 sk 时用了 base64）
    let secretKey;
    try {
      secretKey = Buffer.from(secretKeyB64, 'base64').toString('utf8');
    } catch {
      secretKey = secretKeyB64; // 尝试直接使用（某些场景下 SK 不是 base64）
    }

    const kDate    = hmacSha256(Buffer.from('HMAC256' + secretKey, 'utf8'), dateOnly);
    const kRegion  = hmacSha256(kDate, REGION);
    const kService = hmacSha256(kRegion, SERVICE);
    const kSigning = hmacSha256(kService, 'request');

    // 4. Signature
    const signature = crypto.createHmac('sha256', kSigning)
      .update(stringToSign, 'utf8').digest('hex');

    // 5. Authorization Header
    const credential = `${accessKey}/${credentialScope}`;
    const authHeader =
      `${algorithm} ` +
      `Credential=${credential}, ` +
      `SignedHeaders=${signedHeaders}, ` +
      `Signature=${signature}`;

    return {
      'Authorization':        authHeader,
      'Content-Type':         'application/json',
      'Host':                 host,
      'X-Date':               dateStr,
      'X-Content-SHA256':     bodyHash,
      'Content-Length':       Buffer.byteLength(bodyStr, 'utf8').toString(),
    };
  }

  // ── 通用 API 调用（与 backend.py _hs_call 完全一致）───────────────
  async function hsCall(path, payload, timeoutMs = 120000) {
    const bodyStr  = JSON.stringify(payload);
    const headers  = signV4Headers('POST', path, bodyStr, HOST, ak, skB64);
    const url      = `https://${HOST}${path}`;

    const controller = new AbortController();
    const timer     = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: bodyStr,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await resp.json();
      return data;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  // ── 执行调用 ──────────────────────────────────────────────────────
  let answer     = '';
  let references = [];

  try {
    // 1. 优先用 chat 接口
    const chatResp = await hsCall('/api/knowledge/chat/completions', chatPayload, 120000);

    if (chatResp.code === 0) {
      const data = chatResp.data || {};
      // 取回答（优先 generated_answer，兜底 choices）
      answer =
        data.generated_answer ||
        (data.choices && data.choices[0] &&
         data.choices[0].message && data.choices[0].message.content) ||
        '';

      // 取参考文档
      const refs = data.references || [];
      if (refs.length > 0) {
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
      }
    } else {
      console.error('[FUBAO] chat 接口返回错误:', chatResp);
      answer = `知识库调用失败（code: ${chatResp.code}）：${chatResp.message || '未知错误'}`;
    }

    // 2. 如果 chat 没有返回 references，用 search 接口兜底
    if (references.length === 0) {
      try {
        const searchResp = await hsCall(
          '/api/knowledge/collection/search_knowledge',
          searchPayload,
          30000
        );

        if (searchResp.code === 0) {
          const resultList = (searchResp.data || {}).result_list || [];
          for (let i = 0; i < Math.min(resultList.length, 5); i++) {
            const item    = resultList[i];
            const docInfo = item.doc_info || {};
            references.push({
              num:    i + 1,
              text:   (item.content || '').slice(0, 300),
              source: docInfo.doc_name || '',
              score:  Math.round((item.score || 0) * 1000) / 1000,
            });
          }
        }
      } catch (e) {
        console.error('[FUBAO] search 兜底异常:', e.message);
      }
    }
  } catch (err) {
    console.error('[FUBAO] 全局异常:', err.message);
    answer = `网络异常：${err.message}`;
  }

  console.log(`[FUBAO] 返回 answer(${answer.length}字) + ${references.length} 条参考文档`);

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    answer,
    references,
  });
};
