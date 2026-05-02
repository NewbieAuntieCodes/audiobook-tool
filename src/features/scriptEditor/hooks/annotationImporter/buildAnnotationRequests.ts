import type { Character, Project } from '../../../../types';
import {
  buildLocalCodexChaptersFromSourceIndex,
  createLocalCodexChapterSourceIndex,
  type LocalCodexChapterInput,
} from './localCodex';

export const getOrderedChapterIdsForAnnotationRequest = (
  projectSnapshot: Project,
  chapterIds: string[]
) => {
  const requestedChapterIdSet = new Set(chapterIds);
  return projectSnapshot.chapters
    .filter((chapter) => requestedChapterIdSet.has(chapter.id))
    .map((chapter) => chapter.id);
};

export const buildAnnotationChaptersForRequest = ({
  projectSnapshot,
  chapterIds,
  activeCharacters,
}: {
  projectSnapshot: Project;
  chapterIds: string[];
  activeCharacters: Character[];
}): LocalCodexChapterInput[] => {
  const orderedChapterIds = getOrderedChapterIdsForAnnotationRequest(
    projectSnapshot,
    chapterIds
  );
  if (orderedChapterIds.length === 0) {
    return [];
  }

  const chapterSourceIndex = createLocalCodexChapterSourceIndex(
    projectSnapshot,
    orderedChapterIds
  );

  return buildLocalCodexChaptersFromSourceIndex(
    orderedChapterIds,
    activeCharacters,
    chapterSourceIndex
  );
};
