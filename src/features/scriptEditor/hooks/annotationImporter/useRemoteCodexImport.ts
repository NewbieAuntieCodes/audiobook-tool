import { useCallback } from 'react';
import type { Project } from '../../../../types';
import useStore from '../../../../store/useStore';
import {
  requestCodexLineAssignments,
  type CodexAnnotationChapterInput,
  type CodexLineAssignment,
} from '../../services/codexAnnotationService';
import { buildAnnotationChaptersForRequest } from './buildAnnotationRequests';

interface UseRemoteCodexImportProps {
  currentProject: Project | null;
  getTargetChapterIds: () => string[];
  resolveCurrentProjectSnapshot: () => Project | null;
  applyAssignmentsToChapters: (
    chapterIds: string[],
    assignments: readonly CodexLineAssignment[]
  ) => { charactersWithCvToUpdate: Map<string, string>; updatedCount: number };
  setIsLoadingImportAnnotation: (isLoading: boolean) => void;
}

export function useRemoteCodexImport({
  currentProject,
  getTargetChapterIds,
  resolveCurrentProjectSnapshot,
  applyAssignmentsToChapters,
  setIsLoadingImportAnnotation,
}: UseRemoteCodexImportProps) {
  const handleAutoImportWithCodex = useCallback(async (): Promise<Map<string, string>> => {
    const chapterIds = getTargetChapterIds();
    if (!currentProject || chapterIds.length === 0) {
      return new Map();
    }

    const storeState = useStore.getState();
    const codexSettings = storeState.apiSettings.codex;
    if (!codexSettings.apiKey || !codexSettings.baseUrl || !codexSettings.model) {
      alert('请先在“设置 -> Codex”中填写 Base URL、API Key 和 Model。');
      return new Map();
    }

    const activeCharacters = storeState.characters.filter(
      (character) =>
        (!character.projectId || character.projectId === currentProject.id) &&
        character.status !== 'merged'
    );
    const projectSnapshot = resolveCurrentProjectSnapshot();
    if (!projectSnapshot) {
      return new Map();
    }

    const chaptersForRequest: CodexAnnotationChapterInput[] =
      buildAnnotationChaptersForRequest({
        projectSnapshot,
        chapterIds,
        activeCharacters,
      }).map((chapter) => ({
        chapterId: chapter.chapterId,
        title: chapter.title,
        lines: chapter.lines.map((line) => ({
          lineId: line.lineId,
          index: line.index,
          text: line.text,
          originalText: line.originalText,
          currentCharacterName: line.currentCharacterName,
        })),
      }));

    if (chaptersForRequest.length === 0) {
      alert('当前选择的章节没有可供 Codex 标注的台词行。');
      return new Map();
    }

    setIsLoadingImportAnnotation(true);

    try {
      const assignments = await requestCodexLineAssignments(
        chaptersForRequest,
        activeCharacters.map((character) => ({
          name: character.name,
          cvName: character.cvName || '',
        })),
        storeState.apiSettings
      );

      if (assignments.length === 0) {
        alert('Codex 没有返回可用的标注结果。');
        return new Map();
      }

      const { charactersWithCvToUpdate, updatedCount } = applyAssignmentsToChapters(
        chapterIds,
        assignments
      );
      alert(`Codex 直连标注完成：处理 ${assignments.length} 行，更新 ${updatedCount} 行角色。`);
      return charactersWithCvToUpdate;
    } catch (error: unknown) {
      console.error('Codex annotation failed:', error);
      alert(`Codex annotation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return new Map();
    } finally {
      setIsLoadingImportAnnotation(false);
    }
  }, [
    applyAssignmentsToChapters,
    currentProject,
    getTargetChapterIds,
    resolveCurrentProjectSnapshot,
    setIsLoadingImportAnnotation,
  ]);

  return {
    handleAutoImportWithCodex,
  };
}
