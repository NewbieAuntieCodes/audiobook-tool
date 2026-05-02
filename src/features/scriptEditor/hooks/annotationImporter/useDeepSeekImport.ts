import { useCallback } from 'react';
import type { Project } from '../../../../types';
import useStore from '../../../../store/useStore';
import type { CodexLineAssignment } from '../../services/codexAnnotationService';
import {
  LOCAL_CODEX_BATCH_MAX_ATTEMPTS,
  LOCAL_CODEX_BATCH_RETRY_DELAYS_MS,
  buildLocalCodexBatchPlans,
  buildLocalCodexChaptersFromSourceIndex,
  createLocalCodexChapterSourceIndex,
  estimateLocalCodexKnownCharactersSize,
  formatLocalCodexBatchRange,
  isRetryableLocalCodexError,
  summarizeLocalCodexBatch,
  type LocalCodexChapterInput,
} from './localCodex';
import { getOrderedChapterIdsForAnnotationRequest } from './buildAnnotationRequests';

interface UseDeepSeekImportProps {
  currentProject: Project | null;
  getTargetChapterIds: () => string[];
  resolveCurrentProjectSnapshot: () => Project | null;
  applyAssignmentsToChapters: (
    chapterIds: string[],
    assignments: readonly CodexLineAssignment[]
  ) => { charactersWithCvToUpdate: Map<string, string>; updatedCount: number };
  setIsLoadingImportAnnotation: (isLoading: boolean) => void;
}

const getDeepSeekBatchEffort = (mode: 'flash' | 'pro') => {
  return mode === 'pro' ? 'high' : 'medium';
};

const DEEPSEEK_REQUEST_LIMITS: Record<
  'flash' | 'pro',
  { maxLines: number; maxEstimatedChars: number }
> = {
  flash: { maxLines: 90, maxEstimatedChars: 9500 },
  pro: { maxLines: 45, maxEstimatedChars: 5200 },
};

const estimateDeepSeekLineChars = (line: LocalCodexChapterInput['lines'][number]) => {
  return line.text.length + line.originalText.length + line.currentCharacterName.length + 64;
};

const estimateDeepSeekChapterChunkChars = (chapter: LocalCodexChapterInput) => {
  return (
    chapter.title.length +
    220 +
    chapter.lines.reduce((total, line) => total + estimateDeepSeekLineChars(line), 0)
  );
};

const splitDeepSeekRequestChapters = (
  chapters: LocalCodexChapterInput[],
  mode: 'flash' | 'pro'
): LocalCodexChapterInput[][] => {
  const limits = DEEPSEEK_REQUEST_LIMITS[mode];
  const chapterChunks: LocalCodexChapterInput[] = [];

  chapters.forEach((chapter) => {
    let currentLines: LocalCodexChapterInput['lines'] = [];
    let currentEstimatedChars = chapter.title.length + 220;

    const flushLineChunk = () => {
      if (currentLines.length === 0) {
        return;
      }
      chapterChunks.push({
        ...chapter,
        lines: currentLines,
      });
      currentLines = [];
      currentEstimatedChars = chapter.title.length + 220;
    };

    chapter.lines.forEach((line) => {
      const lineEstimatedChars = estimateDeepSeekLineChars(line);
      const wouldExceedLimits =
        currentLines.length > 0 &&
        (currentLines.length + 1 > limits.maxLines ||
          currentEstimatedChars + lineEstimatedChars > limits.maxEstimatedChars);

      if (wouldExceedLimits) {
        flushLineChunk();
      }

      currentLines.push(line);
      currentEstimatedChars += lineEstimatedChars;
    });

    flushLineChunk();
  });

  const requestChunks: LocalCodexChapterInput[][] = [];
  let currentRequest: LocalCodexChapterInput[] = [];
  let currentLineCount = 0;
  let currentEstimatedChars = 0;

  const flushRequest = () => {
    if (currentRequest.length === 0) {
      return;
    }
    requestChunks.push(currentRequest);
    currentRequest = [];
    currentLineCount = 0;
    currentEstimatedChars = 0;
  };

  chapterChunks.forEach((chapterChunk) => {
    const chunkLineCount = chapterChunk.lines.length;
    const chunkEstimatedChars = estimateDeepSeekChapterChunkChars(chapterChunk);
    const wouldExceedLimits =
      currentRequest.length > 0 &&
      (currentLineCount + chunkLineCount > limits.maxLines ||
        currentEstimatedChars + chunkEstimatedChars > limits.maxEstimatedChars);

    if (wouldExceedLimits) {
      flushRequest();
    }

    currentRequest.push(chapterChunk);
    currentLineCount += chunkLineCount;
    currentEstimatedChars += chunkEstimatedChars;
  });

  flushRequest();
  return requestChunks;
};

type DeepSeekKnownCharacter = {
  name: string;
  cvName: string;
};

const REQUIRED_DEEPSEEK_CHARACTER_NAMES = new Set([
  'Narrator',
  '待识别角色',
  '[静音]',
  '[音效]',
  '音效',
]);

const includesCharacterName = (text: string, name: string) => {
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length < 2) {
    return false;
  }
  return text.includes(normalizedName);
};

const buildCharacterLineUseCounts = (
  projectSnapshot: Project,
  projectId: string,
  activeCharacters: Array<{ id: string; name: string; projectId?: string }>
) => {
  const validCharacterIds = new Set(
    activeCharacters
      .filter((character) => !character.projectId || character.projectId === projectId)
      .map((character) => character.id)
  );
  const counts = new Map<string, number>();

  projectSnapshot.chapters.forEach((chapter) => {
    chapter.scriptLines.forEach((line) => {
      const characterId = typeof line.characterId === 'string' ? line.characterId : '';
      if (!validCharacterIds.has(characterId)) {
        return;
      }
      counts.set(characterId, (counts.get(characterId) || 0) + 1);
    });
  });

  return counts;
};

const buildDeepSeekKnownCharactersForBatch = ({
  activeCharacters,
  chaptersForRequest,
  characterLineUseCounts,
}: {
  activeCharacters: Array<{
    id: string;
    name: string;
    cvName?: string;
  }>;
  chaptersForRequest: Array<{
    lines: Array<{
      text: string;
      originalText: string;
      currentCharacterName: string;
    }>;
  }>;
  characterLineUseCounts: Map<string, number>;
}): DeepSeekKnownCharacter[] => {
  const characterByName = new Map(activeCharacters.map((character) => [character.name, character]));
  const selectedNames = new Set<string>();
  const batchText = chaptersForRequest
    .flatMap((chapter) =>
      chapter.lines.flatMap((line) => [
        line.text || '',
        line.originalText || '',
        line.currentCharacterName || '',
      ])
    )
    .join('\n');

  chaptersForRequest.forEach((chapter) => {
    chapter.lines.forEach((line) => {
      if (line.currentCharacterName) {
        selectedNames.add(line.currentCharacterName);
      }
    });
  });

  activeCharacters.forEach((character) => {
    if (includesCharacterName(batchText, character.name)) {
      selectedNames.add(character.name);
    }
  });

  activeCharacters
    .slice()
    .sort((a, b) => {
      return (characterLineUseCounts.get(b.id) || 0) - (characterLineUseCounts.get(a.id) || 0);
    })
    .slice(0, 24)
    .forEach((character) => {
      selectedNames.add(character.name);
    });

  REQUIRED_DEEPSEEK_CHARACTER_NAMES.forEach((name) => {
    if (characterByName.has(name)) {
      selectedNames.add(name);
    }
  });

  const selectedCharacters = Array.from(selectedNames)
    .map((name) => characterByName.get(name))
    .filter(
      (
        character
      ): character is {
        id: string;
        name: string;
        cvName?: string;
      } => !!character
    )
    .sort((a, b) => {
      const countDiff = (characterLineUseCounts.get(b.id) || 0) - (characterLineUseCounts.get(a.id) || 0);
      return countDiff !== 0 ? countDiff : a.name.localeCompare(b.name, 'zh-Hans-CN');
    })
    .slice(0, 80);

  return selectedCharacters.map((character) => ({
    name: character.name,
    cvName: character.cvName || '',
  }));
};

const formatDeepSeekUsageSummary = (usage: {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
}) => {
  if (usage.totalTokens <= 0) {
    return '';
  }
  const cacheText =
    usage.cacheHitTokens > 0 || usage.cacheMissTokens > 0
      ? `，缓存命中 ${usage.cacheHitTokens} / 未命中 ${usage.cacheMissTokens}`
      : '';
  return `，Token ${usage.totalTokens}（输入 ${usage.promptTokens} / 输出 ${usage.completionTokens}${cacheText}）`;
};

export function useDeepSeekImport({
  currentProject,
  getTargetChapterIds,
  resolveCurrentProjectSnapshot,
  applyAssignmentsToChapters,
  setIsLoadingImportAnnotation,
}: UseDeepSeekImportProps) {
  const handleAutoImportWithDeepSeek = useCallback(
    async (mode: 'flash' | 'pro'): Promise<Map<string, string>> => {
      const chapterIds = getTargetChapterIds();
      if (!currentProject || chapterIds.length === 0) {
        return new Map();
      }

      if (typeof window === 'undefined' || !window.electronAPI?.runDeepSeekRoleSync) {
        alert('当前 Electron 版本不支持 DeepSeek 自动画本，请先重启到最新版本。');
        return new Map();
      }

      const storeState = useStore.getState();
      const deepSeekSettings = storeState.apiSettings.deepseek;
      if (!deepSeekSettings.apiKey || !deepSeekSettings.baseUrl || !deepSeekSettings.model) {
        alert('请先在“设置 -> DeepSeek”中填写 Base URL、API Key 和 Model。');
        return new Map();
      }

      const projectSnapshot = resolveCurrentProjectSnapshot();
      if (!projectSnapshot) {
        return new Map();
      }

      const activeCharacters = storeState.characters.filter(
        (character) =>
          (!character.projectId || character.projectId === currentProject.id) &&
          character.status !== 'merged'
      );
      const orderedChapterIds = getOrderedChapterIdsForAnnotationRequest(
        projectSnapshot,
        chapterIds
      );
      const chapterSourceIndex = createLocalCodexChapterSourceIndex(
        projectSnapshot,
        orderedChapterIds
      );
      const processableChapters = buildLocalCodexChaptersFromSourceIndex(
        orderedChapterIds,
        activeCharacters,
        chapterSourceIndex
      );

      if (processableChapters.length === 0) {
        alert('当前选择的章节没有可供 DeepSeek 标注的台词行。');
        return new Map();
      }

      const batchPlans = buildLocalCodexBatchPlans(
        processableChapters,
        getDeepSeekBatchEffort(mode),
        estimateLocalCodexKnownCharactersSize(
          activeCharacters.slice(0, 80).map((character) => ({
            name: character.name,
            cvName: character.cvName || '',
          }))
        )
      );
      const characterLineUseCounts = buildCharacterLineUseCounts(
        projectSnapshot,
        currentProject.id,
        activeCharacters
      );

      setIsLoadingImportAnnotation(true);

      const accumulatedCharactersWithCvToUpdate = new Map<string, string>();
      let totalAssignments = 0;
      let totalUpdatedCount = 0;
      let totalDurationMs = 0;
      let totalKnownCharactersSent = 0;
      let maxKnownCharactersSent = 0;
      let totalRequestCount = 0;
      const totalUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cacheHitTokens: 0,
        cacheMissTokens: 0,
      };
      const usedModels = new Set<string>();

      try {
        for (let batchIndex = 0; batchIndex < batchPlans.length; batchIndex += 1) {
          const batchPlan = batchPlans[batchIndex];
          const chaptersForBatch = buildLocalCodexChaptersFromSourceIndex(
            batchPlan.chapterIds,
            activeCharacters,
            chapterSourceIndex
          );
          const requestChunks = splitDeepSeekRequestChapters(chaptersForBatch, mode);

          for (let requestIndex = 0; requestIndex < requestChunks.length; requestIndex += 1) {
            const chaptersForRequest = requestChunks[requestIndex];
            const batchChapterIds = Array.from(
              new Set(chaptersForRequest.map((chapter) => chapter.chapterId))
            );
            const refreshedBatchPlan = summarizeLocalCodexBatch(chaptersForRequest) || batchPlan;
            const batchRange = formatLocalCodexBatchRange(refreshedBatchPlan);
            const requestLabel =
              requestChunks.length > 1
                ? `第 ${batchIndex + 1} 批-${requestIndex + 1}/${requestChunks.length} 小段 ${batchRange}`
                : `第 ${batchIndex + 1} 批 ${batchRange}`;
            const knownCharactersForBatch = buildDeepSeekKnownCharactersForBatch({
              activeCharacters,
              chaptersForRequest,
              characterLineUseCounts,
            });
            totalRequestCount += 1;
            totalKnownCharactersSent += knownCharactersForBatch.length;
            maxKnownCharactersSent = Math.max(
              maxKnownCharactersSent,
              knownCharactersForBatch.length
            );
            let lastErrorMessage = '';
            let successfulResult: Awaited<
              ReturnType<NonNullable<typeof window.electronAPI.runDeepSeekRoleSync>>
            > | null = null;

            for (let attempt = 1; attempt <= LOCAL_CODEX_BATCH_MAX_ATTEMPTS; attempt += 1) {
              const result = await window.electronAPI.runDeepSeekRoleSync({
                projectId: currentProject.id,
                projectName: currentProject.name,
                chapterIds: batchChapterIds,
                knownCharacters: knownCharactersForBatch,
                chapters: chaptersForRequest,
                mode,
                settings: {
                  apiKey: deepSeekSettings.apiKey,
                  baseUrl: deepSeekSettings.baseUrl,
                  model: deepSeekSettings.model,
                },
              });

              if (result.success) {
                const assignments = Array.isArray(result.assignments) ? result.assignments : [];
                if (assignments.length > 0) {
                  successfulResult = result;
                  break;
                }
                lastErrorMessage = `${requestLabel} 没有返回可用的标注结果。`;
              } else {
                lastErrorMessage = `${requestLabel} 处理失败：${
                  result.error || 'DeepSeek 没有返回成功结果。'
                }`;
              }

              if (
                attempt >= LOCAL_CODEX_BATCH_MAX_ATTEMPTS ||
                !isRetryableLocalCodexError(lastErrorMessage)
              ) {
                throw new Error(lastErrorMessage);
              }

              const retryDelayMs =
                LOCAL_CODEX_BATCH_RETRY_DELAYS_MS[
                  Math.min(attempt - 1, LOCAL_CODEX_BATCH_RETRY_DELAYS_MS.length - 1)
                ];
              await new Promise((resolve) => window.setTimeout(resolve, retryDelayMs));
            }

            if (!successfulResult) {
              throw new Error(lastErrorMessage || `${requestLabel} 在多次尝试后仍未成功。`);
            }

            const assignments = Array.isArray(successfulResult.assignments)
              ? successfulResult.assignments
              : [];
            const { charactersWithCvToUpdate, updatedCount } = applyAssignmentsToChapters(
              batchChapterIds,
              assignments
            );
            charactersWithCvToUpdate.forEach((cvName, characterId) => {
              accumulatedCharactersWithCvToUpdate.set(characterId, cvName);
            });
            totalAssignments += assignments.length;
            totalUpdatedCount += updatedCount;
            totalDurationMs +=
              typeof successfulResult.meta?.durationMs === 'number'
                ? successfulResult.meta.durationMs
                : 0;
            const usage = successfulResult.meta?.usage as
              | {
                  prompt_tokens?: number;
                  completion_tokens?: number;
                  total_tokens?: number;
                  promptTokens?: number;
                  completionTokens?: number;
                  totalTokens?: number;
                }
              | undefined;
            if (usage) {
              totalUsage.promptTokens += Number(usage.prompt_tokens ?? usage.promptTokens ?? 0);
              totalUsage.completionTokens += Number(
                usage.completion_tokens ?? usage.completionTokens ?? 0
              );
              totalUsage.totalTokens += Number(usage.total_tokens ?? usage.totalTokens ?? 0);
              totalUsage.cacheHitTokens += Number(
                (usage as { prompt_cache_hit_tokens?: number; promptCacheHitTokens?: number })
                  .prompt_cache_hit_tokens ??
                  (usage as { promptCacheHitTokens?: number }).promptCacheHitTokens ??
                  0
              );
              totalUsage.cacheMissTokens += Number(
                (usage as { prompt_cache_miss_tokens?: number; promptCacheMissTokens?: number })
                  .prompt_cache_miss_tokens ??
                  (usage as { promptCacheMissTokens?: number }).promptCacheMissTokens ??
                  0
              );
            }
            if (typeof successfulResult.meta?.model === 'string' && successfulResult.meta.model) {
              usedModels.add(successfulResult.meta.model);
            }
          }
        }

        const modeLabel = mode === 'pro' ? '精细' : '快速';
        const durationText =
          totalDurationMs > 0 ? `，耗时 ${(totalDurationMs / 1000).toFixed(1)} 秒` : '';
        const averageKnownCharacters =
          totalRequestCount > 0 ? Math.round(totalKnownCharactersSent / totalRequestCount) : 0;
        const knownCharactersText =
          totalKnownCharactersSent > 0
            ? `，角色表平均 ${averageKnownCharacters} 个/请求（最多 ${maxKnownCharactersSent} 个）`
            : '';
        const usageText = formatDeepSeekUsageSummary(totalUsage);
        const modelText =
          usedModels.size > 0 ? `，模型 ${Array.from(usedModels).join(' / ')}` : '';
        alert(
          `DeepSeek ${modeLabel}标注完成：共 ${batchPlans.length} 批 / ${totalRequestCount} 次请求，返回 ${totalAssignments} 行，更新 ${totalUpdatedCount} 行角色${durationText}${usageText}${knownCharactersText}${modelText}。`
        );
        return accumulatedCharactersWithCvToUpdate;
      } catch (error: unknown) {
        console.error('DeepSeek annotation failed:', error);
        alert(
          `DeepSeek 标注失败：${error instanceof Error ? error.message : 'Unknown error'}`
        );
        return accumulatedCharactersWithCvToUpdate;
      } finally {
        setIsLoadingImportAnnotation(false);
      }
    },
    [
      applyAssignmentsToChapters,
      currentProject,
      getTargetChapterIds,
      resolveCurrentProjectSnapshot,
      setIsLoadingImportAnnotation,
    ]
  );

  return {
    handleAutoImportWithDeepSeek,
  };
}
