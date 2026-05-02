import { ApiSettings } from '../../../store/slices/uiSlice';
import { getResponsesApiJson } from '../../../services/responsesApiService';

export interface CodexAnnotationKnownCharacter {
  name: string;
  cvName: string;
}

export interface CodexAnnotationLineInput {
  lineId: string;
  index: number;
  text: string;
  originalText: string;
  currentCharacterName: string;
}

export interface CodexAnnotationChapterInput {
  chapterId: string;
  title: string;
  lines: CodexAnnotationLineInput[];
}

export interface CodexLineAssignment {
  chapterId: string;
  lineId: string;
  characterName: string;
  cvName: string;
}

interface CodexLineAssignmentResponse {
  assignments: CodexLineAssignment[];
}

const codexLineAssignmentFormat = {
  type: 'json_schema' as const,
  name: 'chapter_line_assignments',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      assignments: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            chapterId: { type: 'string' },
            lineId: { type: 'string' },
            characterName: { type: 'string' },
            cvName: { type: 'string' },
          },
          required: ['chapterId', 'lineId', 'characterName', 'cvName'],
        },
      },
    },
    required: ['assignments'],
  },
};

export const requestCodexLineAssignments = async (
  chapters: CodexAnnotationChapterInput[],
  knownCharacters: CodexAnnotationKnownCharacter[],
  settings: ApiSettings
): Promise<CodexLineAssignment[]> => {
  const payload = {
    knownCharacters,
    chapters,
  };

  const prompt = `你是一个有声书画本标注助手。

任务目标：
1. 读取输入 JSON 里的 chapters / lines。
2. 为每一行判断角色名，并返回与输入 lineId 对应的结果。
3. narration / 旁白 / 场景描述统一返回角色名 "Narrator"。
4. 如果无法可靠判断角色，返回 "待识别角色"。
5. 如果无法判断 CV，cvName 返回空字符串。
6. 必须复用输入里的 chapterId 和 lineId，不能改写、不能遗漏、不能新增。
7. 优先复用 knownCharacters 中已有的角色名，避免无意义的近义改名。
8. 只返回符合 schema 的 JSON，不要输出解释。

输入 JSON：
${JSON.stringify(payload)}`;

  const result = await getResponsesApiJson<CodexLineAssignmentResponse>(
    'codex',
    settings,
    prompt,
    codexLineAssignmentFormat
  );

  return Array.isArray(result.assignments) ? result.assignments : [];
};
