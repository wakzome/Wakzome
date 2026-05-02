export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://wakzome.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  
  res.json({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    adminToken: process.env.ADMIN_TOKEN
  });
}
