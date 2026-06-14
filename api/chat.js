export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const OR_TOKEN = process.env.OPENROUTER_API_KEY;
  const MODEL = process.env.OR_MODEL || 'deepseek/deepseek-chat-v3.1:free';
  const FALLBACK_MODEL = process.env.OR_FALLBACK_MODEL || 'qwen/qwen-2.5-7b-instruct:free';

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

    let result = await callOpenRouter(MODEL, chatMessages);

    if (!result.ok) {
      const errMsg = result.data?.error?.message || JSON.stringify(result.data);
      console.error(`OpenRouter error on ${MODEL} (${result.status}):`, errMsg);

      // try fallback model once
      const fbResult = await callOpenRouter(FALLBACK_MODEL, chatMessages);
      if (fbResult.ok) {
        result = fbResult;
      } else {
        const fbErrMsg = fbResult.data?.error?.message || JSON.stringify(fbResult.data);
        console.error(`OpenRouter error on fallback ${FALLBACK_MODEL} (${fbResult.status}):`, fbErrMsg);
        return res.status(502).json({
          error: 'Failed to reach OpenRouter API',
          detail: fbResult.data
        });
      }
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
