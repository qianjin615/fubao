export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query } = req.body;
  const apiKey = process.env.VOLC_API_KEY;
  const accountId = process.env.VOLC_ACCOUNT_ID;
  const serviceId = process.env.VOLC_SERVICE_ID;

  try {
    const response = await fetch('https://api-knowledgebase.mlp.cn-beijing.volces.com/api/knowledge/service/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Account-Id': accountId,
      },
      body: JSON.stringify({
        service_id: serviceId,
        messages: [{ role: 'user', content: query }],
      })
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
