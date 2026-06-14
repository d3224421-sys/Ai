export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const OR_TOKEN = process.env.OPENROUTER_API_KEY;
  const MODEL = process.env.OR_MODEL || 'qwen/qwen3-coder:free';
  const FALLBACK_MODELS = (process.env.OR_FALLBACK_MODELS || 'deepseek/deepseek-chat-v3.1:free,meta-llama/llama-3.3-70b-instruct:free')
    .split(',').map(m => m.trim()).filter(Boolean);
  const MODELS = [MODEL, ...FALLBACK_MODELS];

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
          temperature: 0.3,
          top_p: 0.85
        })
      }
    );
    const data = await resp.json();
    return { ok: resp.ok, status: resp.status, data };
  }

  // Some free/auto routes occasionally land on a moderation/guard model
  // that replies with a safety classification instead of a real chat
  // response (e.g. "User Safety: safe\nResponse Safety: safe").
  // Detect that and treat it as a failed attempt so we move on.
  function isGuardOutput(text) {
    if (!text) return true;
    const t = text.trim();
    if (t.length > 400) return false;
    return /\b(user|response)\s+safety\s*:/i.test(t) || /^(safe|unsafe)\b/i.test(t);
  }
  
  try {
    const { messages, research } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || 'You are a helpful AI assistant.';
    const SYSTEM_PROMPT_RESEARCH = process.env.SYSTEM_PROMPT_RESEARCH || (SYSTEM_PROMPT + '\n\nRESEARCH MODE: Give thorough, detailed responses.');

    if (!process.env.SYSTEM_PROMPT) {
      console.warn('SYSTEM_PROMPT env var not set, using generic fallback');
    }

    const systemPrompt = research ? SYSTEM_PROMPT_RESEARCH : SYSTEM_PROMPT;

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: String(msg.content || '')
      }))
    ];

    let result, lastErr;
    let succeeded = false;

    for (const model of MODELS) {
      result = await callOpenRouter(model, chatMessages);
      if (result.ok) {
        const content = result.data?.choices?.[0]?.message?.content?.trim() || '';
        if (content && !isGuardOutput(content)) {
          succeeded = true;
          break;
        }
        lastErr = { error: { message: 'Model returned an empty or safety-classifier response' } };
        console.error(`Model ${model} returned an invalid/guard-style response, trying next fallback`);
        continue;
      }
      lastErr = result.data;
      const errMsg = result.data?.error?.message || JSON.stringify(result.data);
      console.error(`OpenRouter error on ${model} (${result.status}):`, errMsg);
    }

    if (!succeeded) {
      return res.status(502).json({
        error: 'All models failed or returned an invalid response',
        detail: lastErr
      });
    }

    const data = result.data;

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
