// SHIELD Prospector v2 - Background Service Worker

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'callClaude') {
    callClaudeAPI(request.payload)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'analyzeEdit') {
    analyzeEdit(request.payload)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// --- CLAUDE API ---------------------------------------------------------------

async function callClaudeAPI(payload) {
  const { profileData, messageHistory, language, apiKey, feedbackContext } = payload;

  const systemPrompt = buildSystemPrompt(feedbackContext);
  const userPrompt = buildUserPrompt(profileData, messageHistory, language);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  const text = data.content[0].text;

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Resposta inv?lida da API. Tente novamente.');

  return JSON.parse(jsonMatch[0]);
}

// --- EDIT ANALYSIS -----------------------------------------------------------

async function analyzeEdit(payload) {
  const { original, edited, profileData, apiKey } = payload;

  const prompt = `Voc? est? analisando como David Elias Magalh?es (AE da SHIELD) editou uma mensagem gerada por IA para prospec??o no LinkedIn.

MENSAGEM ORIGINAL GERADA:
"${original}"

MENSAGEM AP?S EDI??O DO DAVID:
"${edited}"

CONTEXTO DO PROSPECT:
- Cargo: ${profileData.currentRole || profileData.headline || 'N/A'}
- Empresa: ${profileData.currentCompany || 'N/A'}

Analise as diferen?as e extraia aprendizados concretos sobre o estilo do David. Responda APENAS com JSON neste formato exato, sem texto antes ou depois:
{
  "summary": "1 frase resumindo o padr?o principal da edi??o",
  "changes": [
    { "type": "tom|estrutura|conteudo|cta|personaliza??o", "original_fragment": "trecho original", "edited_fragment": "trecho editado", "lesson": "o que aprender com isso" }
  ],
  "style_rules": [
    "regra de estilo extra?da em 1 frase imperativa"
  ],
  "pattern_score": { "more_casual": true/false, "shorter": true/false, "more_personal": true/false, "stronger_hook": true/false }
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) throw new Error('Erro ao analisar edi??o');

  const data = await response.json();
  const text = data.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Resposta inv?lida');

  return JSON.parse(jsonMatch[0]);
}

// --- PROMPTS ------------------------------------------------------------------

function buildSystemPrompt(feedbackContext) {
  let feedbackSection = '';

  if (feedbackContext && feedbackContext.length > 0) {
    const rules = [];
    feedbackContext.forEach(fb => {
      if (fb.style_rules) rules.push(...fb.style_rules);
    });

    if (rules.length > 0) {
      const uniqueRules = [...new Set(rules)].slice(0, 10);
      feedbackSection = `\n## APRENDIZADOS DAS EDI??ES DO DAVID (alta prioridade)\nO David j? editou mensagens anteriores. Estes s?o padr?es extra?dos dessas edi??es - siga-os rigorosamente:\n${uniqueRules.map(r => `- ${r}`).join('\n')}\n`;
    }
  }

  return `Voc? ? o assistente de prospec??o do David Elias Magalh?es, Account Executive da SHIELD (shield.com).
${feedbackSection}
## QUEM ? A SHIELD
Plataforma de device-first fraud intelligence. Identifica e bloqueia dispositivos fraudulentos em tempo real - app tampering, hooking, emuladores, multi-accounting - sem depender de geolocaliza??o ou treinamento de modelo.

## DIFERENCIAIS PRINCIPAIS
- Device ID persistente a prova de fraude (FRR 0.01% em persist?ncia, 0.04% em envios de risco)
- Global Device ID: bloqueia o mesmo device em toda a rede de clientes simultaneamente
- Monitora risco durante TODA a sess?o, n?o por checks pontuais
- Performa no m?ximo desde o primeiro segundo - zero treinamento, zero dados hist?ricos
- Geralmente a ferramenta mais barata do techstack de fraude
- SDK embarcado + dashboard global e por cliente

## VALUE PROP POR SEGMENTO

**eKYC / Identity Tech (Unico, Ondato, IDWise, Onebox)**
- Bloqueia devices comprometidos ANTES da biometria (tampering, hooking, emuladores)
- Global Device ID bloqueia o fraudador em todos os clientes deles ao mesmo tempo
- Device intelligence completo ? autentica??o sem fric??o, reduz custos com ferramentas extras
- 18% maior persist?ncia de device vs FingerprintJS

**BaaS / Payment Providers (Pine Labs)**
- Bloqueia device antes da transa??o ? reduz chargeback, protege reputa??o da plataforma
- SHIELD embarcado no stack = diferencial competitivo + argumento de upsell

**Fintech / E-wallet / Neobank (TrueMoney, Maya, Banco Industrial, Coopenae, MongePay)**
- Bloqueia multi-accounting e contas mula em tempo real
- Impede contas falsas, empr?stimos fraudulentos e lavagem de dinheiro
- ATO via monitoramento cont?nuo de sess?o

**E-commerce / Marketplace (OLX, Alibaba/AliExpress, Meesho)**
- Bloqueia device antes da transa??o ? melhora taxa de aprova??o, reduz chargeback
- Detecta promo abuse, fraude em cupons e autofraude de parceiros
- OLX: 7% melhor que Incognia ap?s 1 ano de uso do concorrente

**Ride-Hailing / Delivery (Grab, Swiggy, Deliveroo, inDrive)**
- Collus?o, autofraude, fazendas de fraude, fraude promocional - detectados pelo device
- Monitora driver e passageiro em tempo real por toda a jornada

## REGRAS R?GIDAS
- NUNCA atribuir FRR 0.04% ? Unico
- Benchmark vs concorrente: S? mencionar se tiver certeza que o prospect usa aquele concorrente
- NUNCA listar todos os clientes - s? os relevantes pro segmento
- NUNCA explicar o produto em detalhes no primeiro toque
- NUNCA soar corporativo ou usar linguagem de marketing

## TOM E ESTILO DO DAVID
- Informal, direto, natural - "fala", "bora", "meu caro", "meu amigo"
- Frases curtas, conversacionais - nunca text?o no primeiro toque
- Humor leve e autodepreciativo quando natural
- Personaliza SEMPRE com algo espec?fico do perfil (cargo novo, post, concorrente, indica??o)
- CTA simples e sem press?o: "vale um papo?", "vale 20 minutos?"
- Follow-up leve, sem cobrar: "acho que nossas msgs se perderam na correria"
- Se h? hist?rico: continua a conversa naturalmente, N?O recome?a do zero

## FORMATO DE SA?DA
Retorne APENAS um array JSON v?lido, sem texto antes ou depois:
[
  { "label": "Gancho: [?ngulo em 3 palavras]", "message": "texto da mensagem" },
  { "label": "Gancho: [?ngulo em 3 palavras]", "message": "texto da mensagem" },
  { "label": "Gancho: [?ngulo em 3 palavras]", "message": "texto da mensagem" }
]`;
}

function buildUserPrompt(profileData, messageHistory, language) {
  const langInstruction = language === 'es'
    ? 'Escreva as mensagens em ESPANHOL (tom natural, n?o formal).'
    : 'Escreva as mensagens em PORTUGU?S BRASILEIRO (tom natural, informal).';

  let prompt = `${langInstruction}\n\n## PERFIL DO PROSPECT\n`;
  prompt += `Nome: ${profileData.name || 'N?o identificado'}\n`;
  prompt += `Cargo atual: ${profileData.currentRole || profileData.headline || 'N?o identificado'}\n`;
  prompt += `Empresa: ${profileData.currentCompany || 'N?o identificada'}\n`;
  if (profileData.location) prompt += `Localiza??o: ${profileData.location}\n`;
  if (profileData.headline && profileData.headline !== profileData.currentRole) {
    prompt += `Headline completa: ${profileData.headline}\n`;
  }
  if (profileData.about) prompt += `Sobre (about): ${profileData.about}\n`;
  if (profileData.source) prompt += `Fonte: ${profileData.source === 'salesnav_profile' ? 'Sales Navigator' : 'LinkedIn'}\n`;

  if (profileData.recentPosts?.length > 0) {
    prompt += `\n## POSTS RECENTES DO PROSPECT\n`;
    profileData.recentPosts.forEach((p, i) => {
      if (p.trim()) prompt += `Post ${i + 1}: "${p}"\n`;
    });
  }

  if (messageHistory?.length > 0) {
    prompt += `\n## HIST?RICO DE MENSAGENS COM ESTE LEAD\n`;
    messageHistory.forEach(msg => {
      const speaker = msg.direction === 'sent' ? 'David' : profileData.name || 'Prospect';
      prompt += `[${speaker}]: ${msg.text}\n`;
    });
    prompt += `\n?? H? hist?rico de conversa. Gere FOLLOW-UPS naturais - n?o primeiro contato.\n`;
  } else {
    prompt += `\nN?o h? hist?rico. Este ? um PRIMEIRO CONTATO.\n`;
  }

  prompt += `\nGere 3 op??es de mensagem para o David, cada uma com um ?ngulo diferente de personaliza??o.`;
  return prompt;
}
