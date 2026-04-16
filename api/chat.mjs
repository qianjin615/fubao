export const config = { runtime: 'edge' };

export default async function handler(req) {
 if (req.method === 'OPTIONS') {
 return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
 }
 const { query } = await req.json();
 const apiKey = process.env.VOLC_API_KEY;
 const accountId = process.env.ACCOUNT_ID;
 const serviceId = process.env.HUOSHAN_KB;
 console.log('apiKey前4位:', apiKey ? apiKey.substring(0,4) : 'undefined');
 const url = 'https://api-knowledgebase.mlp.cn-beijing.volces.com/api/knowledge/chat/completions';
 const body = JSON.stringify({ messages: [{ role: 'user', content: query }], model: 'Doubao-seed-2-0-pro', return_references: true, service_id: serviceId });
 console.log('发送请求到火山方舟');
 const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey, 'X-Account-Id': accountId }, body });
 console.log('火山方舟状态码:', resp.status);
 const data = await resp.json();
 console.log('火山方舟返回:', JSON.stringify(data).substring(0, 300));
 const answer = data?.choices?.[0]?.message?.content || data?.generated_answer || data?.message || '暂时无法获取回答';
 const refs = (data?.references || []).map(r => r.doc_name || r.title || '').filter(Boolean);
 return new Response(JSON.stringify({ answer, refs }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}
