import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { Character } from '../../../../types';
import {
  buildApplyRewriteSegments,
  buildRewriteKnownCharacters,
  buildRewriteSelectionPayload,
  countSegmentLines,
  didPreviewChangeSelection,
  normalizePreviewSegments,
} from './localScriptRewriteModalData';

interface UseLocalScriptRewriteModalActionsOptions {
  canUseBackgroundQueue: boolean;
  canUseDeepSeekRewrite: boolean;
  canUseLocalCodex: boolean;
  chapterId: string;
  chapterTitle: string;
  characters: Character[];
  customInstructions: string;
  deepSeekSettings: DeepSeekRoleSyncSettings;
  endLine: number;
  mode: LocalCodexScriptRewriteMode;
  onApplyRewrite: (payload: {
    mode: LocalCodexScriptRewriteMode;
    summary: string;
    segments: LocalCodexScriptRewriteApplySegment[];
  }) => void;
  onEnqueueTask: (task: LocalCodexScriptRewriteTask) => void;
  previewLineCount: number;
  previewSegments: LocalCodexScriptRewriteResultSegment[];
  previewSummary: string;
  projectId: string;
  projectName: string;
  reasoningEffort: string;
  selectedBlocks: LocalCodexScriptRewriteSelectionBlock[];
  selectedSegments: LocalCodexScriptRewriteSelectionSegment[];
  selectedText: string;
  setErrorMessage: Dispatch<SetStateAction<string>>;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
  setIsSubmittingTask: Dispatch<SetStateAction<boolean>>;
  setPreviewSegments: Dispatch<
    SetStateAction<LocalCodexScriptRewriteResultSegment[]>
  >;
  setPreviewSummary: Dispatch<SetStateAction<string>>;
  startLine: number;
  model: string;
}

export const useLocalScriptRewriteModalActions = ({
  canUseBackgroundQueue,
  canUseDeepSeekRewrite,
  canUseLocalCodex,
  chapterId,
  chapterTitle,
  characters,
  customInstructions,
  deepSeekSettings,
  endLine,
  mode,
  model,
  onApplyRewrite,
  onEnqueueTask,
  previewLineCount,
  previewSegments,
  previewSummary,
  projectId,
  projectName,
  reasoningEffort,
  selectedBlocks,
  selectedSegments,
  selectedText,
  setErrorMessage,
  setIsGenerating,
  setIsSubmittingTask,
  setPreviewSegments,
  setPreviewSummary,
  startLine,
}: UseLocalScriptRewriteModalActionsOptions) => {
  const handleGeneratePreview = useCallback(async () => {
    if (!selectedSegments.length) {
      alert('当前没有选中的脚本段。');
      return;
    }
    if (!selectedText.trim()) {
      alert('当前发送给 AI 的内容为空，请先调整选区文本。');
      return;
    }
    const canUseDeepSeek =
      canUseDeepSeekRewrite && window.electronAPI?.runDeepSeekScriptRewrite;
    const canUseCodexFallback =
      canUseLocalCodex && window.electronAPI?.runLocalCodexScriptRewrite;

    if (!canUseDeepSeek && !canUseCodexFallback) {
      alert('当前 Electron 版本不支持“局部 AI 重画本”，请先重启到最新版本。');
      return;
    }

    setIsGenerating(true);
    setErrorMessage('');
    setPreviewSummary('');
    setPreviewSegments([]);

    try {
      const commonPayload = {
        projectId,
        projectName,
        chapterId,
        chapterTitle,
        knownCharacters: buildRewriteKnownCharacters(characters, projectId),
        mode,
        customInstructions,
        selection: buildRewriteSelectionPayload({
          blocks: selectedBlocks,
          endLine,
          selectedSegments,
          selectedText,
          startLine,
        }),
      };

      const result = canUseDeepSeek
        ? await window.electronAPI.runDeepSeekScriptRewrite({
            ...commonPayload,
            settings: deepSeekSettings,
          })
        : await window.electronAPI.runLocalCodexScriptRewrite({
            ...commonPayload,
            executionOptions: {
              model,
              reasoningEffort,
            },
          });

      if (!result.success) {
        throw new Error(
          result.error || (canUseDeepSeek ? 'DeepSeek 没有返回可用结果。' : '本地 Codex 没有返回可用结果。')
        );
      }

      const normalizedSegments = normalizePreviewSegments(selectedSegments, result);
      const hasChanges = didPreviewChangeSelection({
        previewSegments: normalizedSegments,
        selectedSegments,
      });
      setPreviewSummary(
        hasChanges
          ? result.summary || '已生成局部重画预览。'
          : '本次预览和当前选区基本一致，AI 没有判断出必须修改的地方。若你想拆出更多群杂声音，请切到“丰富群杂”，或在自定义要求里明确写“这几句请分给不同临时角色”。'
      );
      setPreviewSegments(normalizedSegments);
      if (countSegmentLines(normalizedSegments) === 0) {
        setErrorMessage(
          'AI 已返回结果，但没有生成可用的画本行。你可以补充要求再试一次。'
        );
      } else if (!hasChanges) {
        setErrorMessage(
          '没有检测到变化：这不是报错，只是当前模式下 AI 选择保留原样。'
        );
      }
    } catch (error) {
      console.error('Local script rewrite failed:', error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsGenerating(false);
    }
  }, [
    canUseDeepSeekRewrite,
    canUseLocalCodex,
    chapterId,
    chapterTitle,
    characters,
    customInstructions,
    deepSeekSettings,
    endLine,
    mode,
    model,
    projectId,
    projectName,
    reasoningEffort,
    selectedBlocks,
    selectedSegments,
    selectedText,
    setErrorMessage,
    setIsGenerating,
    setPreviewSegments,
    setPreviewSummary,
    startLine,
  ]);

  const handleApplyRewrite = useCallback(() => {
    if (previewLineCount === 0) {
      alert('请先生成预览，并确保至少有一条画本行。');
      return;
    }

    const applySegments = buildApplyRewriteSegments({
      previewSegments,
      selectedSegments,
    });

    if (applySegments.some((segment) => segment.lines.length === 0)) {
      alert('仍有选中的段没有生成可应用结果，请重新生成或调整要求。');
      return;
    }

    onApplyRewrite({
      mode,
      summary: previewSummary,
      segments: applySegments,
    });
  }, [
    mode,
    onApplyRewrite,
    previewLineCount,
    previewSegments,
    previewSummary,
    selectedSegments,
  ]);

  const handleEnqueueTask = useCallback(
    async (priority: LocalCodexTaskPriority = 'normal') => {
      if (!selectedSegments.length) {
        alert('当前没有选中的脚本段。');
        return;
      }
      if (!selectedText.trim()) {
        alert('当前发送给 AI 的内容为空，请先调整选区文本。');
        return;
      }
      if (
        !canUseBackgroundQueue ||
        !window.electronAPI?.enqueueLocalCodexScriptRewrite
      ) {
        alert('当前版本先使用 DeepSeek 前台预览；后台队列暂时不启用。');
        return;
      }

      setIsSubmittingTask(true);
      setErrorMessage('');

      try {
        const result = await window.electronAPI.enqueueLocalCodexScriptRewrite({
          projectId,
          projectName,
          chapterId,
          chapterTitle,
          knownCharacters: buildRewriteKnownCharacters(characters, projectId),
          mode,
          priority,
          customInstructions,
          selection: buildRewriteSelectionPayload({
            blocks: selectedBlocks,
            endLine,
            selectedSegments,
            selectedText,
            startLine,
          }),
        executionOptions: {
          model,
          reasoningEffort,
        },
      });

        if (!result.success || !result.task) {
          throw new Error(result.error || '后台任务创建失败。');
        }

        onEnqueueTask(result.task);
      } catch (error) {
        console.error('Enqueue local script rewrite failed:', error);
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setIsSubmittingTask(false);
      }
    },
    [
      canUseBackgroundQueue,
      chapterId,
      chapterTitle,
      characters,
      customInstructions,
      endLine,
      mode,
      model,
      onEnqueueTask,
      projectId,
      projectName,
      reasoningEffort,
      selectedBlocks,
      selectedSegments,
      selectedText,
      setErrorMessage,
      setIsSubmittingTask,
      startLine,
    ]
  );

  return {
    handleApplyRewrite,
    handleEnqueueTask,
    handleGeneratePreview,
  };
};
