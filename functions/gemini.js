/**
 * Cloudflare Pages Function — /api/gemini
 * Variável de ambiente necessária: GEMINI_API_KEY
 * Deploy: coloque este arquivo em /functions/api/gemini.js no repositório
 */

const SYSTEM_INSTRUCTION = `Você é o Professor IA do Brain Academy, um assistente educacional amigável e didático para estudantes brasileiros de todas as idades.

REGRAS OBRIGATÓRIAS:
1. Responda SEMPRE em Português do Brasil, nunca em outro idioma.
2. Seja didático, encorajador e use emojis moderados (1-3 por resposta).
3. Para MATEMÁTICA: mostre o passo a passo VERTICALMENTE, um cálculo por linha, como numa lousa.
   Exemplo de formato matemático:
   Passo 1: 24 ÷ 6
   Passo 2: = 4
   ✅ Resultado: 4
4. Para outras matérias: explique de forma clara, com exemplos concretos quando possível.
5. Se a pergunta não for educacional, redirecione gentilmente para temas de estudo.
6. Limite respostas a no máximo 250 palavras para não sobrecarregar o aluno.
7. Termine com uma frase motivacional curta quando apropriado.`;

export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Configuração do servidor incompleta.' }),
      { status: 500, headers }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Requisição inválida.' }),
      { status: 400, headers }
    );
  }

  const history = Array.isArray(body.history) ? body.history : [];

  // Garante que o histórico termina com role: user
  const validHistory = history.filter(
    (m) => m && (m.role === 'user' || m.role === 'model') && Array.isArray(m.parts)
  );

  if (validHistory.length === 0 || validHistory[validHistory.length - 1].role !== 'user') {
    return new Response(
      JSON.stringify({ error: 'Histórico inválido.' }),
      { status: 400, headers }
    );
  }

  const geminiPayload = {
    system_instruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }],
    },
    contents: validHistory,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 600,
      topP: 0.9,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  const geminiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  let geminiRes;
  try {
    geminiRes = await fetch(geminiURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
    });
  } catch {
    return new Response(
      JSON.stringify({ error: 'Falha ao conectar com a IA. Tente novamente.' }),
      { status: 502, headers }
    );
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error('Gemini API error:', errText);
    return new Response(
      JSON.stringify({ error: 'Erro na API de IA. Tente novamente em instantes.' }),
      { status: 502, headers }
    );
  }

  const geminiData = await geminiRes.json();

  // Verifica se a resposta foi bloqueada por segurança
  const candidate = geminiData?.candidates?.[0];
  if (!candidate) {
    return new Response(
      JSON.stringify({ reply: '⚠️ Não consegui gerar uma resposta. Tente reformular sua pergunta!' }),
      { status: 200, headers }
    );
  }

  if (candidate.finishReason === 'SAFETY') {
    return new Response(
      JSON.stringify({ reply: '⚠️ Essa pergunta não pôde ser respondida por questões de segurança. Tente uma pergunta educacional!' }),
      { status: 200, headers }
    );
  }

  const reply = candidate?.content?.parts?.[0]?.text ?? 'Desculpe, não consegui gerar uma resposta. Tente novamente!';

  return new Response(
    JSON.stringify({ reply }),
    { status: 200, headers }
  );
}
