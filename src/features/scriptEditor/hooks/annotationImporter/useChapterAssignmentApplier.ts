import { useCallback } from 'react';
import type { Character, Project } from '../../../../types';
import {
  startLocalCodexPerfSpan,
} from '../../../../lib/localCodexPerfDebug';
import type {
  ApplyAssignmentsOptions,
} from './localCodex';
import type { CodexLineAssignment } from '../../services/codexAnnotationService';

interface UseChapterAssignmentApplierProps {
  applyUndoableProjectUpdate: (
    updater: (prevProject: Project) => Project
  ) => void;
  resolveCharacterForAssignment: (
    projectId: string,
    rawCharacterName: string,
    cvName: string | undefined,
    newCharacterMap: Map<string, Character>
  ) => Character;
  setMultiSelectedChapterIdsAfterProcessing: (ids: string[]) => void;
  setIsImportModalOpen: (isOpen: boolean) => void;
}

export function useChapterAssignmentApplier({
  applyUndoableProjectUpdate,
  resolveCharacterForAssignment,
  setMultiSelectedChapterIdsAfterProcessing,
  setIsImportModalOpen,
}: UseChapterAssignmentApplierProps) {
  const applyAssignmentsToChapters = useCallback(
    (
      chapterIds: string[],
      assignments: readonly CodexLineAssignment[],
      options: ApplyAssignmentsOptions = {}
    ): { charactersWithCvToUpdate: Map<string, string>; updatedCount: number } => {
      const finishPerf = startLocalCodexPerfSpan(
        'useAnnotationImporter.applyAssignmentsToChapters',
        {
          chapterCount: chapterIds.length,
          assignmentCount: assignments.length,
        }
      );
      const {
        closeImportModal = true,
        updateSelectionAfterApply = true,
      } = options;
      const charactersWithCvToUpdate = new Map<string, string>();
      const assignmentMap = new Map<string, CodexLineAssignment>();
      let changedChapterCount = 0;

      assignments.forEach((assignment) => {
        assignmentMap.set(`${assignment.chapterId}::${assignment.lineId}`, assignment);
      });

      const newCharacterMap = new Map<string, Character>();
      const chapterIdSet = new Set(chapterIds);
      let updatedCount = 0;

      applyUndoableProjectUpdate((prevProject) => ({
        ...prevProject,
        chapters: prevProject.chapters.map((chapter) => {
          if (!chapterIdSet.has(chapter.id)) {
            return chapter;
          }

          let chapterChanged = false;
          const updatedScriptLines = chapter.scriptLines.map((line) => {
            const assignment = assignmentMap.get(`${chapter.id}::${line.id}`);
            if (!assignment) {
              return line;
            }

            const character = resolveCharacterForAssignment(
              prevProject.id,
              assignment.characterName,
              assignment.cvName,
              newCharacterMap
            );

            if (
              assignment.cvName &&
              (!character.cvName ||
                character.cvName.toLowerCase() !== assignment.cvName.toLowerCase())
            ) {
              charactersWithCvToUpdate.set(character.id, assignment.cvName);
            }

            if (line.characterId !== character.id) {
              chapterChanged = true;
              updatedCount += 1;
              return { ...line, characterId: character.id };
            }

            return line;
          });

          if (chapterChanged) {
            changedChapterCount += 1;
            return { ...chapter, scriptLines: updatedScriptLines };
          }

          return chapter;
        }),
      }));

      if (updateSelectionAfterApply) {
        setMultiSelectedChapterIdsAfterProcessing(chapterIds);
      }
      if (closeImportModal) {
        setIsImportModalOpen(false);
      }

      finishPerf({
        updatedCount,
        changedChapterCount,
        charactersWithCvToUpdateCount: charactersWithCvToUpdate.size,
      });
      return { charactersWithCvToUpdate, updatedCount };
    },
    [
      applyUndoableProjectUpdate,
      resolveCharacterForAssignment,
      setIsImportModalOpen,
      setMultiSelectedChapterIdsAfterProcessing,
    ]
  );

  return {
    applyAssignmentsToChapters,
  };
}
