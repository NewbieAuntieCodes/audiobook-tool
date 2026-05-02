import { useEffect, useMemo } from 'react';
import type { Chapter, Project } from '../../../../types';

const formatChapterNumber = (index: number) => {
  if (index < 0) return '';
  const number = index + 1;
  return number < 1000 ? String(number).padStart(3, '0') : String(number);
};

interface UseScriptEditorPanelViewModelOptions {
  currentProject: Project | null;
  isLoadingAiAnnotation: boolean;
  isLoadingManualParse: boolean;
  selectedChapterId: string | null;
}

interface ScriptEditorPanelViewModel {
  canMergeAdjacentSameCharacterInChapter: boolean;
  characterIdsInChapter: Set<string>;
  customSoundTypes: string[];
  displayTitle: string;
  hasScriptLines: boolean;
  isCurrentlyLoadingLines: boolean;
  selectedChapter: Chapter | null;
  selectedChapterIndex: number;
}

export const useScriptEditorPanelViewModel = ({
  currentProject,
  isLoadingAiAnnotation,
  isLoadingManualParse,
  selectedChapterId,
}: UseScriptEditorPanelViewModelOptions): ScriptEditorPanelViewModel => {
  const selectedChapter =
    currentProject?.chapters.find((chapter) => chapter.id === selectedChapterId) ||
    null;
  const selectedChapterIndex =
    selectedChapter && currentProject
      ? currentProject.chapters.findIndex((chapter) => chapter.id === selectedChapter.id)
      : -1;

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.info('[ScriptEditorPanel] selection check', {
        selectedChapterId,
        selectedChapterIndex,
        hasSelected: !!selectedChapter,
        chapterCount: currentProject?.chapters.length || 0,
        chaptersSample:
          currentProject?.chapters.slice(0, 3).map((chapter) => chapter.id) || [],
      });
    }
  }, [currentProject, selectedChapter, selectedChapterId, selectedChapterIndex]);

  const characterIdsInChapter = useMemo(() => {
    if (!selectedChapter) return new Set<string>();

    return new Set(
      selectedChapter.scriptLines
        .map((line) => line.characterId)
        .filter((id): id is string => !!id)
    );
  }, [selectedChapter]);

  const customSoundTypes = useMemo(
    () => currentProject?.customSoundTypes || [],
    [currentProject?.customSoundTypes]
  );

  const isCurrentlyLoadingLines =
    !!selectedChapter &&
    (isLoadingAiAnnotation || isLoadingManualParse) &&
    selectedChapter.scriptLines.length === 0;

  const hasScriptLines = !!selectedChapter && selectedChapter.scriptLines.length > 0;

  const canMergeAdjacentSameCharacterInChapter = useMemo(() => {
    if (!selectedChapter || selectedChapter.scriptLines.length < 2) return false;

    const lines = selectedChapter.scriptLines;
    for (let i = 1; i < lines.length; i++) {
      const previousCharacterId = lines[i - 1]?.characterId;
      const currentCharacterId = lines[i]?.characterId;
      if (
        currentCharacterId &&
        previousCharacterId &&
        currentCharacterId === previousCharacterId
      ) {
        return true;
      }
    }

    return false;
  }, [selectedChapter]);

  const displayTitle =
    selectedChapter && selectedChapterIndex >= 0
      ? `${formatChapterNumber(selectedChapterIndex)} ${selectedChapter.title}`
      : '';

  return {
    canMergeAdjacentSameCharacterInChapter,
    characterIdsInChapter,
    customSoundTypes,
    displayTitle,
    hasScriptLines,
    isCurrentlyLoadingLines,
    selectedChapter,
    selectedChapterIndex,
  };
};
