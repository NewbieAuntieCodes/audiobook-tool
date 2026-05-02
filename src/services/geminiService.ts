import { GoogleGenAI } from "@google/genai";
import { AiAnnotatedLine } from '../types';
import { ApiSettings, AiProvider } from '../store/slices/uiSlice';
import { getResponsesApiJson } from './responsesApiService';

type ChatCompletionProvider = Exclude<AiProvider, 'gemini' | 'codex'>;

const codexAnnotationFormat = {
  type: 'json_schema' as const,
  name: 'annotated_script_lines',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            line_text: { type: 'string' },
            suggested_character_name: { type: 'string' },
          },
          required: ['line_text', 'suggested_character_name'],
        },
      },
    },
    required: ['items'],
  },
};

const getOpenAICompatibleResponse = async (provider: ChatCompletionProvider, settings: ApiSettings, prompt: string): Promise<any> => {
    // FIX: The 'gemini' provider should not use this function. Add a guard to prevent this.
    const config = settings[provider];
    if (!config || !config.apiKey || !config.baseUrl || !config.model) {
      throw new Error(`Configuration for ${provider} is incomplete. Check settings.`);
    }
  
    const body: any = {
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    };
  
    // Add response_format only for providers that support it well (like OpenAI)
    if (provider === 'openai') {
      body.response_format = { type: "json_object" };
    }
  
    const response = await fetch(config.baseUrl.endsWith('/chat/completions') ? config.baseUrl : `${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API request failed for ${provider}: ${response.statusText} - ${errorBody}`);
    }
  
    const data = await response.json();
    const jsonStr = data.choices[0].message.content;
    
    // Clean up potential markdown code fences from the response string
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    const cleanedJsonStr = match ? match[2].trim() : jsonStr.trim();
    
    return JSON.parse(cleanedJsonStr);
};

export const getAiAnnotatedScript = async (
  scriptText: string,
  provider: AiProvider,
  settings: ApiSettings
): Promise<AiAnnotatedLine[]> => {
  const prompt = `You are an assistant for a scriptwriting application. Your task is to analyze the provided script text and break it down into distinct lines, assigning each to a speaker.

**CRITICAL RULE: NO MERGING.** Absolutely forbid merging consecutive dialogue lines, even if they are spoken by the same character. Every individual dialogue line from the original text MUST correspond to a separate object in the output JSON array.

A critical requirement is to handle lines or paragraphs containing both narration (e.g., character actions, scene descriptions) and direct dialogue (speech enclosed in quotation marks like “...” or 「...」).
When such a mixed text block is encountered:
1. You MUST split this into separate output lines: one for the narration part and one for the dialogue part.
2. Assign the narration part to 'Narrator'.
3. Assign the dialogue part to the character who is speaking. The speaker might be indicated by a speech tag (e.g., '白瑶说：“你好。”' implies 白瑶 is speaking '你好。') or by context within the narration preceding the dialogue.

Example 1 (Narration followed by dialogue):
Input Text Block: "白瑶赶紧下床，可怜兮兮的说：“沈迹，我居然脱发！”"
Expected JSON Output:
[
  { "line_text": "白瑶赶紧下床，可怜兮兮的说：", "suggested_character_name": "Narrator" },
  { "line_text": "沈迹，我居然脱发！", "suggested_character_name": "白瑶" }
]
(Note: The AI should infer '白瑶' as the speaker of the dialogue from the preceding narrative context "白瑶...说:".)

Example 2 (Pure dialogue with speech tag as part of a larger text, or standalone):
Input Text Block: "白瑶：“你好！”"
Expected JSON Output:
[
  { "line_text": "你好！", "suggested_character_name": "白瑶" }
]
(Note: The speech tag '白瑶：' directly indicates the speaker, and the tag itself should not be part of the 'line_text' for the dialogue.)

Example 3 (Pure narration):
Input Text Block: "窗外下着雨。"
Expected JSON Output:
[
  { "line_text": "窗外下着雨。", "suggested_character_name": "Narrator" }
]

Example 4 (Handling Consecutive Dialogue):
Input Text Block:
"白瑶：“你好。”
白瑶：“你怎么样？”"
Correct JSON Output (Separate Objects):
[
  { "line_text": "你好。", "suggested_character_name": "白瑶" },
  { "line_text": "你怎么样？", "suggested_character_name": "白瑶" }
]
Incorrect JSON Output (Merged):
[
  { "line_text": "你好。你怎么样？", "suggested_character_name": "白瑶" }
]


If a line is purely dialogue without an explicit character name in a tag (e.g., just “救命！”), try to infer the speaker from recent context or use 'Unknown Character' if the context is insufficient. If a line is purely narration, assign it to 'Narrator'.

Format your response as a JSON array of objects. Each object MUST have exactly two keys:
1. 'line_text': (string) The text of the narration or dialogue. For dialogue lines, 'line_text' should contain ONLY the spoken words, without any surrounding quotation marks (e.g., no "", 「」, '', etc.). The application will add appropriate quotation marks during display. For narration lines, 'line_text' should be the plain narration.
2. 'suggested_character_name': (string) The name of the character speaking (e.g., "白瑶", "沈迹"), or 'Narrator'.

Ensure valid JSON output. Prioritize accurate separation of narration and dialogue. Each distinct piece of narration or dialogue should be its own object in the array.
Reiterate: Strictly maintain a one-to-one correspondence for dialogue lines, never merge.

Here is the script text:
---
${scriptText}
---
`;

  try {
    let parsedData: any;
    switch (provider) {
      case 'gemini':
        const apiKey = settings.gemini.apiKey || process.env.API_KEY;
        if (!apiKey) throw new Error("Gemini API Key is not configured.");
        const ai = new GoogleGenAI({ apiKey });
        const stream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                temperature: 0.2,
            },
        });

        let accumulatedText = '';
        for await (const chunk of stream) {
            accumulatedText += chunk.text;
        }
        
        const jsonStr = accumulatedText.trim();
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonStr.match(fenceRegex);
        parsedData = JSON.parse(match ? match[2].trim() : jsonStr);
        break;

      case 'codex':
        parsedData = await getResponsesApiJson<{ items: AiAnnotatedLine[] }>(
          'codex',
          settings,
          prompt,
          codexAnnotationFormat
        );
        parsedData = parsedData.items;
        break;
      
      case 'openai':
      case 'moonshot':
      case 'deepseek':
        parsedData = await getOpenAICompatibleResponse(provider, settings, prompt);
        break;

      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }

    let rawItemsArray: any[] | null = null;
    if (Array.isArray(parsedData)) {
        rawItemsArray = parsedData;
    } else if (typeof parsedData === 'object' && parsedData !== null) {
        const keys = Object.keys(parsedData);
        if (keys.length > 0 && Array.isArray(parsedData[keys[0]])) {
            rawItemsArray = parsedData[keys[0]];
        }
    }

    if (rawItemsArray) {
        const correctedData = rawItemsArray.map((item: any): AiAnnotatedLine => {
            const lineText = item.line_text;
            const characterName = item.suggested_character_name || item.suggester_character_name;
            return {
                line_text: typeof lineText === 'string' ? lineText : "",
                suggested_character_name: typeof characterName === 'string' ? characterName : "Narrator"
            };
        });

        if (correctedData.every(item => typeof item.line_text === 'string' && typeof item.suggested_character_name === 'string')) {
            return correctedData;
        } else {
            throw new Error("Invalid response format from AI after corrections.");
        }
    } else {
        throw new Error("Invalid response format from AI. Expected a JSON array.");
    }

  } catch (error: unknown) {
    console.error(`Error with ${provider} API or parsing response:`, String(error));
    // FIX: Safely handle error object of type 'unknown'.
    alert(`Error with AI Annotation: ${error instanceof Error ? error.message : String(error)}.`);
    throw error;
  }
};
