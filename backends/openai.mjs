// Any OpenAI-compatible chat-completions API: OpenAI, Ollama, LM Studio, vLLM, OpenRouter, ...
//   OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-4o-mini BACKEND=openai node server.mjs
//   OPENAI_BASE_URL=http://localhost:11434/v1 OPENAI_MODEL=llama3.2 BACKEND=openai node server.mjs
export default async function openai(text, { systemPrompt }) {
  const base = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? 'none'}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
    }),
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}
