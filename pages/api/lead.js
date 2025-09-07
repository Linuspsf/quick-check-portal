
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ok:false});
  const payload = req.body || {};
  const url = process.env.LEAD_WEBHOOK_URL;
  if (url) {
    try {
      await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    } catch (e) {}
  }
  return res.status(200).json({ok:true});
}
