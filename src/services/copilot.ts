/**
 * Copilot Service — GitHub Models API integration for chat + inline completions.
 */

export interface CopilotMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CopilotConfig {
  token: string;
  model: string;
  inlineEnabled: boolean;
}

const API_URL = 'https://models.inference.ai.azure.com/chat/completions';

function getHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Build the system prompt including workspace context.
 */
export function buildSystemPrompt(
  activeFile: string,
  activeContent: string,
  allFiles: string[],
  mode: 'ask' | 'agent',
): string {
  let prompt = `You are a helpful coding assistant inside PyCode, a browser-based Python IDE. The user is working on Python code.`;

  if (activeFile) {
    prompt += `\n\nThe user has "${activeFile}" open:\n\`\`\`\n${activeContent}\n\`\`\``;
  }

  prompt += `\n\nFiles in workspace: ${allFiles.join(', ')}`;

  if (mode === 'agent') {
    prompt += `\n\nYou are in AGENT mode. You can edit files in the workspace.

For EDITING existing files, use search/replace blocks:
\`\`\`edit:filename.py
<<<SEARCH
exact lines to find
===
replacement lines
REPLACE>>>
\`\`\`

You can include multiple <<<SEARCH/===/REPLACE>>> blocks in one edit block.
The SEARCH text must EXACTLY match existing lines in the file.

For CREATING new files, use:
\`\`\`newfile:filename.py
file content here
\`\`\`

Always explain what you're doing. Keep edits minimal and targeted.`;
  }

  return prompt;
}

/**
 * Stream a chat response. Yields delta strings.
 */
export async function* streamChat(
  token: string,
  model: string,
  systemPrompt: string,
  messages: CopilotMessage[],
): AsyncGenerator<string, string> {
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    stream: true,
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 401) {
      throw new Error(
        'Token unauthorized — make sure your GitHub PAT has the **Models** permission. Update at [github.com/settings/tokens](https://github.com/settings/tokens).',
      );
    }
    throw new Error(`API error (${response.status}): ${err}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!;

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          yield delta;
        }
      } catch { /* skip malformed */ }
    }
  }

  return fullContent;
}

/**
 * Get an inline code completion.
 */
export async function getInlineCompletion(
  token: string,
  model: string,
  prefix: string,
  suffix: string,
  language: string,
): Promise<string | null> {
  if (!token) return null;

  const body = {
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are a code completion engine. Return ONLY the code that continues from where the cursor is. No explanation, no markdown fences, just raw code. Be concise — typically 1-3 lines.',
      },
      {
        role: 'user',
        content: `Complete this ${language} code. Return ONLY the completion text.\n\n${prefix}█${suffix}`,
      },
    ],
    max_tokens: 128,
    temperature: 0,
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(body),
  });

  if (!response.ok) return null;

  const result = await response.json();
  return result.choices?.[0]?.message?.content?.trim() || null;
}
