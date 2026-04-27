export default async function handler(req, res) {
  // Allow cross-origin requests from Github Pages
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )

  // Handle preflight CORS request
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  // Ensure it's a POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not configured on the server.' });
  }

  try {
    // Forward the payload exactly as received to Gemini
    const googleResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body)
    });

    const data = await googleResponse.json();
    return res.status(googleResponse.status).json(data);
  } catch (error) {
    console.error('Serverless Function proxy error:', error);
    return res.status(500).json({ error: 'Internal Server Error connecting to Gemini API' });
  }
}
