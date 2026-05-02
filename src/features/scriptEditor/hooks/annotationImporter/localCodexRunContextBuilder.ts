import type { Character, Project } from '../../../../types';
import {
  resolveLocalCodexExecutionSettings,
  type LocalCodexSettings,
} from '../../../../store/slices/uiSlice';
import {
  buildLocalCodexBatchPlans,
  buildLocalCodexChaptersFromSourceIndex,
  createLocalCodexChapterSourceIndex,
  estimateLocalCodexKnownCharactersSize,
  type LocalCodexRunContext,
} from './localCodex';
import { getOrderedChapterIdsForAnnotationRequest } from './buildAnnotationRequests';

export const buildLocalCodexRunContext = ({
  currentProject,
  projectSnapshot,
  chapterIds,
  activeCharacters,
  localCodexSettings,
}: {
  currentProject: Pick<Project, 'id' | 'name'>;
  projectSnapshot: Project;
  chapterIds: string[];
  activeCharacters: Character[];
  localCodexSettings: Partial<LocalCodexSettings> | null | undefined;
}): LocalCodexRunContext | null => {
  const orderedChapterIds = getOrderedChapterIdsForAnnotationRequest(
    projectSnapshot,
    chapterIds
  );
  if (orderedChapterIds.length === 0) {
    return null;
  }

  const localCodexExecutionSettings =
    resolveLocalCodexExecutionSettings(localCodexSettings);
  const initialKnownCharacters = activeCharacters.map((character) => ({
    name: character.name,
    cvName: character.cvName || '',
  }));
  const chapterSourceIndex = createLocalCodexChapterSourceIndex(
    projectSnapshot,
    orderedChapterIds
  );
  const processableChapters = buildLocalCodexChaptersFromSourceIndex(
    orderedChapterIds,
    activeCharacters,
    chapterSourceIndex
  );
  const processableChapterIds = processableChapters.map((chapter) => chapter.chapterId);

  if (processableChapterIds.length === 0) {
    return null;
  }

  return {
    projectId: currentProject.id,
    projectName: currentProject.name,
    orderedChapterIds,
    processableChapterIds,
    skippedChapterCount: orderedChapterIds.length - processableChapterIds.length,
    batchPlans: buildLocalCodexBatchPlans(
      processableChapters,
      localCodexExecutionSettings.reasoningEffort,
      estimateLocalCodexKnownCharactersSize(initialKnownCharacters)
    ),
    localCodexExecutionSettings,
    chapterSourceIndex,
  };
};
