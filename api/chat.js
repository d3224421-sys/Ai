export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const OR_TOKEN = process.env.OPENROUTER_API_KEY;
  const PRIMARY_MODEL = process.env.OR_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
  const FALLBACK_MODELS = (process.env.OR_FALLBACK_MODELS || 'meta-llama/llama-3.1-8b-instruct:free,qwen/qwen-2.5-72b-instruct:free,mistralai/mistral-7b-instruct:free,google/gemma-2-9b-it:free,microsoft/phi-3-mini-128k-instruct:free,deepseek/deepseek-chat:free,huggingfaceh4/zephyr-7b-beta:free')
    .split(',').map(m => m.trim()).filter(Boolean);
  const MODELS = [PRIMARY_MODEL, ...FALLBACK_MODELS];

  if (!OR_TOKEN) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not set' });
  }

  async function callOpenRouter(model, chatMessages) {
    const resp = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OR_TOKEN}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://ai-kang-daffa.vercel.app',
          'X-Title': 'KnGDfA Ai'
        },
        body: JSON.stringify({
          model,
          messages: chatMessages,
          max_tokens: 4096,
          temperature: 0.7,
          top_p: 0.9
        })
      }
    );
    const data = await resp.json();
    return { ok: resp.ok, status: resp.status, data };
  }
  
  try {
    const { messages, research } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT;
    const SYSTEM_PROMPT_RESEARCH = process.env.SYSTEM_PROMPT_RESEARCH || (SYSTEM_PROMPT + '\n\nRESEARCH MODE: Give thorough, detailed responses.');

    const systemPrompt = research ? SYSTEM_PROMPT_RESEARCH : SYSTEM_PROMPT;

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: String(msg.content || '')
      }))
    ];

    let data, lastErr;
    let succeeded = false;
    const attemptLog = [];

    for (let mi = 0; mi < MODELS.length && !succeeded; mi++) {
      const model = MODELS[mi];
      const result = await callOpenRouter(model, chatMessages);

      if (result.ok) {
        data = result.data;
        succeeded = true;
        attemptLog.push({ model, status: 'ok' });
        break;
      }

      lastErr = result.data;
      const errMsg = result.data?.error?.message || JSON.stringify(result.data);
      attemptLog.push({ model, status: result.status, message: errMsg });
      console.error(`OpenRouter error on ${model} (${result.status}):`, errMsg);
    }

    if (!succeeded) {
      console.error('All models exhausted:', JSON.stringify(attemptLog));
      return res.status(502).json({
        error: 'Failed to reach OpenRouter API (all models exhausted)',
        detail: lastErr,
        attempts: attemptLog
      });
    }

    const choice = data.choices?.[0];
    const reply = choice?.message?.content?.trim();

    if (!reply) {
      console.error('Empty reply from model:', JSON.stringify(data));
      return res.status(502).json({ error: 'Empty response from model', detail: data });
    }

    const truncated = choice?.finish_reason === 'length';
    return res.status(200).json({ reply, truncated });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}
