import { useCallback, useState } from 'react';
import { Project, Character } from '../../../types';
import useStore from '../../../store/useStore';
import { useAnnotationCharacterResolver } from './annotationImporter/useAnnotationCharacterResolver';
import { useChapterAssignmentApplier } from './annotationImporter/useChapterAssignmentApplier';
import { useLocalCodexTaskState } from './annotationImporter/useLocalCodexTaskState';
import { useDeepSeekImport } from './annotationImporter/useDeepSeekImport';
import { useLocalCodexImport } from './annotationImporter/useLocalCodexImport';
import { usePreAnnotatedImport } from './annotationImporter/usePreAnnotatedImport';
import { useRemoteCodexImport } from './annotationImporter/useRemoteCodexImport';

interface UseAnnotationImporterProps {
  currentProject: Project | null;
  onAddCharacter: (
    character: Pick<
      Character,
      'name' | 'color' | 'textColor' | 'cvName' | 'description' | 'isStyleLockedToCv'
    >
  ) => Character;
  applyUndoableProjectUpdate: (updater: (prevProject: Project) => Project) => void;
  selectedChapterId: string | null;
  multiSelectedChapterIds: string[];
  setMultiSelectedChapterIdsAfterProcessing: (ids: string[]) => void;
}

export const useAnnotationImporter = ({
  currentProject,
  onAddCharacter,
  applyUndoableProjectUpdate,
  selectedChapterId,
  multiSelectedChapterIds,
  setMultiSelectedChapterIdsAfterProcessing,
}: UseAnnotationImporterProps) => {
  const [isLoadingImportAnnotation, setIsLoadingImportAnnotation] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const {
    localCodexTaskStatus,
    updateLocalCodexTaskStatus,
    dismissLocalCodexTaskStatus,
    cancelLocalCodexTask,
    isLocalCodexTaskRunning,
    cancelLocalCodexRequestedRef,
    pendingLocalCodexResumeRef,
  } = useLocalCodexTaskState();
  const { resolveCharacterForAssignment } = useAnnotationCharacterResolver({
    onAddCharacter,
  });
  const { applyAssignmentsToChapters } = useChapterAssignmentApplier({
    applyUndoableProjectUpdate,
    resolveCharacterForAssignment,
    setMultiSelectedChapterIdsAfterProcessing,
    setIsImportModalOpen,
  });

  const getTargetChapterIds = useCallback(() => {
    return multiSelectedChapterIds.length > 0
      ? multiSelectedChapterIds
      : selectedChapterId
      ? [selectedChapterId]
      : [];
  }, [multiSelectedChapterIds, selectedChapterId]);

  const handleOpenImportModalTrigger = useCallback(() => {
    setIsImportModalOpen(true);
  }, []);

  const resolveCurrentProjectSnapshot = useCallback(() => {
    if (!currentProject) {
      return null;
    }

    return (
      useStore.getState().projects.find((project) => project.id === currentProject.id) ||
      currentProject
    );
  }, [currentProject]);

  const { handleImportPreAnnotatedScript } = usePreAnnotatedImport({
    currentProject,
    getTargetChapterIds,
    applyUndoableProjectUpdate,
    resolveCharacterForAssignment,
    setIsLoadingImportAnnotation,
    setIsImportModalOpen,
  });

  const { handleAutoImportWithCodex } = useRemoteCodexImport({
    currentProject,
    getTargetChapterIds,
    resolveCurrentProjectSnapshot,
    applyAssignmentsToChapters,
    setIsLoadingImportAnnotation,
  });

  const { handleAutoImportWithDeepSeek } = useDeepSeekImport({
    currentProject,
    getTargetChapterIds,
    resolveCurrentProjectSnapshot,
    applyAssignmentsToChapters,
    setIsLoadingImportAnnotation,
  });

  const { handleAutoImportWithLocalCodex, resumeLocalCodexTask } = useLocalCodexImport({
    currentProject,
    getTargetChapterIds,
    resolveCurrentProjectSnapshot,
    isLocalCodexTaskRunning,
    cancelLocalCodexRequestedRef,
    pendingLocalCodexResumeRef,
    updateLocalCodexTaskStatus,
    setIsImportModalOpen,
    setMultiSelectedChapterIdsAfterProcessing,
    applyAssignmentsToChapters,
  });

  return {
    isLoadingImportAnnotation,
    isImportModalOpen,
    isLocalCodexTaskRunning,
    localCodexTaskStatus,
    dismissLocalCodexTaskStatus,
    cancelLocalCodexTask,
    resumeLocalCodexTask,
    setIsImportModalOpen,
    handleOpenImportModalTrigger,
    handleImportPreAnnotatedScript,
    handleAutoImportWithCodex,
    handleAutoImportWithDeepSeek,
    handleAutoImportWithLocalCodex,
  };
};
