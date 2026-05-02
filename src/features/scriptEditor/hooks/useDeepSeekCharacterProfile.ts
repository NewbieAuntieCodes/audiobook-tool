import { useCallback, useState } from 'react';
import type { Character, CharacterProfile, Project, ScriptLine } from '../../../types';
import useStore from '../../../store/useStore';

interface UseDeepSeekCharacterProfileProps {
  currentProject: Project | null;
  characters: Character[];
}

const MAX_ASSIGNED_LINES = 48;
const MAX_CONTEXT_SNIPPETS = 8;
const CONTEXT_RADIUS = 2;

const isSkippableProfileCharacter = (character: Character) => {
  return ['Narrator', '待识别角色', '[静音]', '[音效]', '音效'].includes(character.name);
};

const buildCharacterNameById = (characters: Character[]) => {
  return new Map(characters.map((character) => [character.id, character.name] as const));
};

const pickAssignedLines = (project: Project, characterId: string) => {
  const assignedLines: Array<{
    chapterTitle: string;
    index: number;
    text: string;
  }> = [];

  project.chapters.forEach((chapter) => {
    chapter.scriptLines.forEach((line, index) => {
      if (line.characterId !== characterId) {
        return;
      }
      assignedLines.push({
        chapterTitle: chapter.title,
        index: index + 1,
        text: line.text || '',
      });
    });
  });

  if (assignedLines.length <= MAX_ASSIGNED_LINES) {
    return assignedLines;
  }

  const firstLines = assignedLines.slice(0, 18);
  const middleStart = Math.max(18, Math.floor(assignedLines.length / 2) - 8);
  const middleLines = assignedLines.slice(middleStart, middleStart + 16);
  const lastLines = assignedLines.slice(-14);
  return [...firstLines, ...middleLines, ...lastLines].slice(0, MAX_ASSIGNED_LINES);
};

const pickContextSnippets = (
  project: Project,
  character: Character,
  characterNameById: Map<string, string>
) => {
  const snippets: Array<{
    chapterTitle: string;
    lines: Array<{ speaker: string; text: string }>;
  }> = [];

  for (const chapter of project.chapters) {
    for (let index = 0; index < chapter.scriptLines.length; index += 1) {
      const line = chapter.scriptLines[index];
      const lineText = line.text || '';
      const isAssignedToCharacter = line.characterId === character.id;
      const mentionsCharacter =
        character.name.length >= 2 && lineText.includes(character.name);

      if (!isAssignedToCharacter && !mentionsCharacter) {
        continue;
      }

      const start = Math.max(0, index - CONTEXT_RADIUS);
      const end = Math.min(chapter.scriptLines.length, index + CONTEXT_RADIUS + 1);
      const lines = chapter.scriptLines
        .slice(start, end)
        .map((contextLine: ScriptLine) => ({
          speaker: contextLine.characterId
            ? characterNameById.get(contextLine.characterId) || ''
            : '',
          text: contextLine.text || '',
        }))
        .filter((contextLine) => contextLine.text.trim());

      if (lines.length > 0) {
        snippets.push({
          chapterTitle: chapter.title,
          lines,
        });
      }

      if (snippets.length >= MAX_CONTEXT_SNIPPETS) {
        return snippets;
      }
    }
  }

  return snippets;
};

const formatUsage = (usage: unknown) => {
  if (!usage || typeof usage !== 'object') {
    return '';
  }

  const usageObject = usage as {
    total_tokens?: number;
    totalTokens?: number;
    prompt_tokens?: number;
    promptTokens?: number;
    completion_tokens?: number;
    completionTokens?: number;
  };
  const totalTokens = Number(usageObject.total_tokens ?? usageObject.totalTokens ?? 0);
  const promptTokens = Number(usageObject.prompt_tokens ?? usageObject.promptTokens ?? 0);
  const completionTokens = Number(
    usageObject.completion_tokens ?? usageObject.completionTokens ?? 0
  );

  return totalTokens > 0
    ? `，Token ${totalTokens}（输入 ${promptTokens} / 输出 ${completionTokens}）`
    : '';
};

export function useDeepSeekCharacterProfile({
  currentProject,
  characters,
}: UseDeepSeekCharacterProfileProps) {
  const [characterProfileGenerationId, setCharacterProfileGenerationId] = useState<string | null>(
    null
  );

  const generateCharacterProfileWithDeepSeek = useCallback(
    async (character: Character) => {
      if (!currentProject) {
        return;
      }
      if (isSkippableProfileCharacter(character)) {
        alert('旁白、音效、静音和待识别角色暂时不需要生成角色描述。');
        return;
      }
      if (typeof window === 'undefined' || !window.electronAPI?.runDeepSeekCharacterProfile) {
        alert('当前 Electron 版本不支持 DeepSeek 角色描述，请先重启到最新版本。');
        return;
      }

      const storeState = useStore.getState();
      const deepSeekSettings = storeState.apiSettings.deepseek;
      if (!deepSeekSettings.apiKey || !deepSeekSettings.baseUrl) {
        alert('请先在“设置 -> DeepSeek”中填写 Base URL 和 API Key。');
        return;
      }

      const characterNameById = buildCharacterNameById(characters);
      const assignedLines = pickAssignedLines(currentProject, character.id);
      const contextSnippets = pickContextSnippets(
        currentProject,
        character,
        characterNameById
      );

      if (assignedLines.length === 0 && contextSnippets.length === 0) {
        alert('这个角色还没有足够片段，无法生成角色描述。');
        return;
      }

      setCharacterProfileGenerationId(character.id);
      try {
        const result = await window.electronAPI.runDeepSeekCharacterProfile({
          projectId: currentProject.id,
          projectName: currentProject.name,
          character: {
            id: character.id,
            name: character.name,
            cvName: character.cvName || '',
            description: character.description || '',
            profile: character.profile || {},
          },
          knownCharacters: characters.map((item) => ({
            name: item.name,
            cvName: item.cvName || '',
          })),
          evidence: {
            assignedLines,
            contextSnippets,
          },
          settings: {
            apiKey: deepSeekSettings.apiKey,
            baseUrl: deepSeekSettings.baseUrl,
            model: deepSeekSettings.model,
          },
        });

        if (!result.success || !result.profile) {
          throw new Error(result.error || 'DeepSeek 没有返回角色描述。');
        }

        await useStore.getState().updateCharacterProfile(character.id, result.profile);
        const durationText =
          typeof result.meta?.durationMs === 'number'
            ? `，耗时 ${(result.meta.durationMs / 1000).toFixed(1)} 秒`
            : '';
        const usageText = formatUsage(result.meta?.usage);
        const modelText = result.meta?.model ? `，模型 ${result.meta.model}` : '';
        alert(`已生成“${character.name}”的角色描述${durationText}${usageText}${modelText}。`);
      } catch (error) {
        console.error('DeepSeek character profile failed:', error);
        alert(
          `DeepSeek 角色描述失败：${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        setCharacterProfileGenerationId(null);
      }
    },
    [characters, currentProject]
  );

  return {
    characterProfileGenerationId,
    generateCharacterProfileWithDeepSeek,
  };
}
