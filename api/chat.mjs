export const config = { runtime: 'edge' };

export default async function handler(req) {
 if (req.method === 'OPTIONS') {
 return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
 }
 const { query } = await req.json();
 const apiKey = process.env.VOLC_API_KEY;
 const serviceId = process.env.HUOSHAN_KB;
 console.log('apiKey前8位:', apiKey ? apiKey.substring(0,8) : 'undefined');
 const url = 'https://ark.cn-beijing.volces.com/api/v3/knowledge_bases/' + serviceId + '/completions';
 const body = JSON.stringify({ messages: [{ role: 'user', content: query }], return_references: true });
 console.log('请求URL:', url);
 const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey }, body });
 console.log('状态码:', resp.status);
 const data = await resp.json();
 console.log('返回:', JSON.stringify(data).substring(0, 300));
 const answer = data?.choices?.[0]?.message?.content || data?.generated_answer || '暂时无法获取回答';
 const refs = (data?.references || []).map(r => r.doc_name || r.title || '').filter(Boolean);
 return new Response(JSON.stringify({ answer, refs }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}
