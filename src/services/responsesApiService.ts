import { ApiSettings, AiProvider } from '../store/slices/uiSlice';

export type ResponsesApiProvider = Exclude<AiProvider, 'gemini'>;

interface JsonSchemaFormat {
  type: 'json_schema';
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
}

const stripTrailingSlashes = (value: string): string => value.replace(/\/+$/, '');
const normalizeSettingValue = (value: string | undefined): string => (value || '').trim();

const buildResponsesEndpoint = (baseUrl: string): string => {
  const normalized = stripTrailingSlashes(normalizeSettingValue(baseUrl));
  if (!normalized) {
    throw new Error('Responses API base URL is empty.');
  }

  if (normalized.endsWith('/responses')) {
    return normalized;
  }

  if (normalized.endsWith('/v1')) {
    return `${normalized}/responses`;
  }

  return `${normalized}/v1/responses`;
};

const buildChatCompletionsEndpoint = (baseUrl: string): string => {
  const normalized = stripTrailingSlashes(normalizeSettingValue(baseUrl));
  if (!normalized) {
    throw new Error('Chat Completions base URL is empty.');
  }

  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }

  if (normalized.endsWith('/v1')) {
    return `${normalized}/chat/completions`;
  }

  return `${normalized}/v1/chat/completions`;
};

const extractResponseText = (payload: any): string => {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (Array.isArray(payload?.output)) {
    const collected = payload.output
      .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
      .map((content: any) => (typeof content?.text === 'string' ? content.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim();

    if (collected) {
      return collected;
    }
  }

  throw new Error('Responses API did not return any text output.');
};

const parseJsonPayload = <T>(rawText: string): T => {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(jsonText) as T;
};

const shouldUseLocalDevProxy = (): boolean => {
  if (typeof window === 'undefined') return false;
  const origin = window.location?.origin || '';
  return /^https?:\/\/localhost(?::\d+)?$/i.test(origin) || /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin);
};

const fetchViaApp = async (endpoint: string, headers: Record<string, string>, body: Record<string, unknown>): Promise<Response> => {
  const requestPayload = {
    endpoint,
    headers,
    body,
  };

  if (shouldUseLocalDevProxy()) {
    return fetch('/__responses_proxy__', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    });
  }

  return fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
};

const extractChatCompletionsText = (payload: any): string => {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
    if (text) return text;
  }

  throw new Error('Chat Completions API did not return message content.');
};

const shouldFallbackToChatCompletions = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|404|405|5\d\d|bad gateway|gateway timeout|Responses API did not return any text output/i.test(message);
};

const getChatCompletionsJson = async <T>(
  provider: ResponsesApiProvider,
  baseUrl: string,
  apiKey: string,
  model: string,
  input: string,
  format: JsonSchemaFormat
): Promise<T> => {
  const endpoint = buildChatCompletionsEndpoint(baseUrl);
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
    'User-Agent': 'codex-app/1.0',
  };
  const prompt = `${input}

Return only valid JSON that strictly matches this JSON schema:
${JSON.stringify(format.schema)}`;
  const body = {
    model,
    temperature: 0.1,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    response_format: {
      type: 'json_object',
    },
  };

  const tryRequest = async (requestBody: Record<string, unknown>): Promise<T> => {
    const response = await fetchViaApp(endpoint, headers, requestBody);
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Chat Completions fallback failed for ${provider}: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const payload = await response.json();
    return parseJsonPayload<T>(extractChatCompletionsText(payload));
  };

  try {
    return await tryRequest(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/response_format|json_object/i.test(message)) {
      throw error;
    }

    const { response_format, ...bodyWithoutResponseFormat } = body;
    void response_format;
    return tryRequest(bodyWithoutResponseFormat);
  }
};

export const getResponsesApiJson = async <T>(
  provider: ResponsesApiProvider,
  settings: ApiSettings,
  input: string,
  format: JsonSchemaFormat
): Promise<T> => {
  const config = settings[provider];

  const apiKey = normalizeSettingValue(config?.apiKey);
  const baseUrl = normalizeSettingValue(config?.baseUrl);
  const model = normalizeSettingValue(config?.model);

  if (!config || !apiKey || !baseUrl || !model) {
    throw new Error(`Configuration for ${provider} is incomplete. Check settings.`);
  }

  const endpoint = buildResponsesEndpoint(baseUrl);
  const requestBody = {
    model,
    input,
    text: {
      format,
    },
  };
  const requestHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
    'User-Agent': 'codex-app/1.0',
  };

  try {
    const response = await fetchViaApp(endpoint, requestHeaders, requestBody);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Responses API request failed for ${provider}: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const payload = await response.json();
    return parseJsonPayload<T>(extractResponseText(payload));
  } catch (error) {
    if (!shouldFallbackToChatCompletions(error)) {
      throw error;
    }

    return getChatCompletionsJson<T>(provider, baseUrl, apiKey, model, input, format);
  }
};
