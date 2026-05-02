import { useCallback } from 'react';
import type { Character, Project } from '../../../../types';
import {
  parsePreAnnotatedSpeakerMap,
  resolveDialogueContentForAnnotatedLine,
} from './preAnnotatedScript';

interface UsePreAnnotatedImportProps {
  currentProject: Project | null;
  getTargetChapterIds: () => string[];
  applyUndoableProjectUpdate: (
    updater: (prevProject: Project) => Project
  ) => void;
  resolveCharacterForAssignment: (
    projectId: string,
    rawCharacterName: string,
    cvName: string | undefined,
    newCharacterMap: Map<string, Character>
  ) => Character;
  setIsLoadingImportAnnotation: (isLoading: boolean) => void;
  setIsImportModalOpen: (isOpen: boolean) => void;
}

export function usePreAnnotatedImport({
  currentProject,
  getTargetChapterIds,
  applyUndoableProjectUpdate,
  resolveCharacterForAssignment,
  setIsLoadingImportAnnotation,
  setIsImportModalOpen,
}: UsePreAnnotatedImportProps) {
  const handleImportPreAnnotatedScript = useCallback(
    async (annotatedText: string): Promise<Map<string, string>> => {
      const chapterIds = getTargetChapterIds();
      if (!currentProject || chapterIds.length === 0) {
        return new Map();
      }

      setIsLoadingImportAnnotation(true);
      const charactersWithCvToUpdate = new Map<string, string>();

      try {
        const annotationMap = parsePreAnnotatedSpeakerMap(annotatedText);
        const newCharacterMap = new Map<string, Character>();

        applyUndoableProjectUpdate((prevProject) => ({
          ...prevProject,
          chapters: prevProject.chapters.map((chapter) => {
            if (!chapterIds.includes(chapter.id)) {
              return chapter;
            }

            const updatedScriptLines = chapter.scriptLines.map((line) => {
              const dialogueContent = resolveDialogueContentForAnnotatedLine(
                line.text,
                line.originalText
              );
              if (!dialogueContent) {
                return line;
              }

              const annotation = annotationMap.get(dialogueContent);
              if (!annotation) {
                return line;
              }

              const { charName, cvName } = annotation;
              const character = resolveCharacterForAssignment(
                prevProject.id,
                charName,
                cvName,
                newCharacterMap
              );

              if (
                cvName &&
                (!character.cvName || character.cvName.toLowerCase() !== cvName.toLowerCase())
              ) {
                charactersWithCvToUpdate.set(character.id, cvName);
              }

              return { ...line, characterId: character.id };
            });

            return { ...chapter, scriptLines: updatedScriptLines };
          }),
        }));

        setIsImportModalOpen(false);
        return charactersWithCvToUpdate;
      } catch (error: unknown) {
        console.error('Annotation import failed:', error);
        alert(
          `Annotation import failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
        return new Map();
      } finally {
        setIsLoadingImportAnnotation(false);
      }
    },
    [
      currentProject,
      applyUndoableProjectUpdate,
      getTargetChapterIds,
      resolveCharacterForAssignment,
      setIsImportModalOpen,
      setIsLoadingImportAnnotation,
    ]
  );

  return {
    handleImportPreAnnotatedScript,
  };
}
