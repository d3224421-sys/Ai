// File: api/chat.js
// Endpoint backend untuk KnGDfA Ai
// Menerima: { messages: [{role: "user"/"assistant", content: "..."}] }
// Mengembalikan: { reply: "..." }
//
// Menggunakan Hugging Face Inference Providers (format OpenAI-compatible):
// https://router.huggingface.co/v1/chat/completions

import { PERSONA } from './systemPrompt.js';

export default async function handler(req, res) {
  // Hanya izinkan POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const HF_TOKEN = process.env.HF_API_KEY;
  // Model default pakai Llama 3.1 8B Instruct (lebih cepat & masih gratis lewat Inference Providers)
  const MODEL = process.env.HF_MODEL || 'meta-llama/Meta-Llama-3.1-8B-Instruct';

  if (!HF_TOKEN) {
    return res.status(500).json({ error: 'HF_API_KEY belum diatur di environment variable' });
  }

  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Format messages tidak valid' });
    }

    // Susun messages format OpenAI: system + history
    const chatMessages = [
      { role: 'system', content: PERSONA.trim() },
      ...messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }))
    ];

    const hfResponse = await fetch(
      'https://router.huggingface.co/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL,
          messages: chatMessages,
          max_tokens: 512,
          temperature: 0.7,
          top_p: 0.9
        })
      }
    );

    const data = await hfResponse.json();

    if (!hfResponse.ok) {
      console.error('Hugging Face error:', JSON.stringify(data));
      return res.status(502).json({
        error: 'Gagal menghubungi Hugging Face API',
        detail: data.error || data
      });
    }

    const reply = data.choices?.[0]?.message?.content?.trim()
      || 'Maaf, tidak ada balasan yang bisa diproses.';

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server', detail: err.message });
  }
}
