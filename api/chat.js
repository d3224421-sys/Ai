import { SYSTEM_PROMPT, SYSTEM_PROMPT_RESEARCH } from './systemPrompt.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const HF_TOKEN = process.env.HF_API_KEY;
  const MODEL = process.env.HF_MODEL || 'meta-llama/Meta-Llama-3-8B-Instruct';

  if (!HF_TOKEN) {
    return res.status(500).json({ error: 'HF_API_KEY not set' });
  }

  try {
    const { messages, research } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    const systemPrompt = research ? SYSTEM_PROMPT_RESEARCH : SYSTEM_PROMPT;

    const chatMessages = [
      { role: 'system', content: String(systemPrompt) },
      ...messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: String(msg.content || '')
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
          max_tokens: 1024,
          temperature: 0.7,
          top_p: 0.9
        })
      }
    );

    const data = await hfResponse.json();

    if (!hfResponse.ok) {
      console.error('Hugging Face error:', JSON.stringify(data));
      return res.status(502).json({
        error: 'Failed to reach Hugging Face API',
        detail: data.error || data
      });
    }

    const reply = data.choices?.[0]?.message?.content?.trim() || 'No response received.';
    return res.status(200).json({ reply });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}
