// File: api/chat.js
// Endpoint backend untuk KnGDfA Ai
// Menerima: { messages: [{role: "user"/"assistant", content: "..."}] }
// Mengembalikan: { reply: "..." }

export default async function handler(req, res) {
  // Hanya izinkan POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const HF_TOKEN = process.env.HF_API_KEY;
  const MODEL = process.env.HF_MODEL || 'meta-llama/Meta-Llama-3-8B-Instruct';

  if (!HF_TOKEN) {
    return res.status(500).json({ error: 'HF_API_KEY belum diatur di environment variable' });
  }

  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Format messages tidak valid' });
    }

    // Susun prompt dari history chat (format chat template Llama 3)
    let prompt = '<|begin_of_text|>';
    prompt += '<|start_header_id|>system<|end_header_id|>\n\nKamu adalah KnGDfA Ai, asisten AI yang ramah, membantu, dan menjawab dalam Bahasa Indonesia.<|eot_id|>';

    for (const msg of messages) {
      const role = msg.role === 'user' ? 'user' : 'assistant';
      prompt += `<|start_header_id|>${role}<|end_header_id|>\n\n${msg.content}<|eot_id|>`;
    }
    prompt += '<|start_header_id|>assistant<|end_header_id|>\n\n';

    const hfResponse = await fetch(
      `https://api-inference.huggingface.co/models/${MODEL}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 512,
            temperature: 0.7,
            top_p: 0.9,
            return_full_text: false
          }
        })
      }
    );

    if (!hfResponse.ok) {
      const errText = await hfResponse.text();
      console.error('Hugging Face error:', errText);
      return res.status(502).json({ error: 'Gagal menghubungi Hugging Face API', detail: errText });
    }

    const data = await hfResponse.json();

    let reply = '';
    if (Array.isArray(data) && data[0]?.generated_text) {
      reply = data[0].generated_text.trim();
    } else if (data.generated_text) {
      reply = data.generated_text.trim();
    } else if (data.error) {
      // Model masih loading di Hugging Face
      return res.status(503).json({ error: 'Model sedang dimuat, coba lagi sebentar', detail: data.error });
    } else {
      reply = 'Maaf, tidak ada balasan yang bisa diproses.';
    }

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server', detail: err.message });
  }
}
