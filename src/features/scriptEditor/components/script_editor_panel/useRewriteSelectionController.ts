import { useCallback, useMemo, useState, type MouseEvent } from 'react';
import type { Chapter, Character } from '../../../../types';
import {
  buildRewriteSelectionSegments,
  updateRewriteLineSelection,
} from './localRewriteSelection';

interface UseRewriteSelectionControllerOptions {
  characters: Character[];
  selectedChapter: Chapter | null;
}

export const useRewriteSelectionController = ({
  characters,
  selectedChapter,
}: UseRewriteSelectionControllerOptions) => {
  const [isLocalRewriteModalOpen, setIsLocalRewriteModalOpen] = useState(false);
  const [isRewriteSelectionMode, setIsRewriteSelectionMode] = useState(false);
  const [selectedRewriteLineIds, setSelectedRewriteLineIds] = useState<string[]>([]);
  const [rewriteSelectionAnchorLineId, setRewriteSelectionAnchorLineId] =
    useState<string | null>(null);

  const characterById = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters]
  );
  const selectedRewriteLineIdSet = useMemo(
    () => new Set(selectedRewriteLineIds),
    [selectedRewriteLineIds]
  );
  const rewriteSelectedSegments = useMemo(
    () =>
      buildRewriteSelectionSegments(
        selectedChapter,
        selectedRewriteLineIdSet,
        characterById
      ),
    [characterById, selectedChapter, selectedRewriteLineIdSet]
  );
  const rewriteSelectedBlocks = useMemo(
    () => rewriteSelectedSegments.flatMap((segment) => segment.blocks),
    [rewriteSelectedSegments]
  );
  const canStartLocalRewrite = !!selectedChapter?.scriptLines.length;

  const resetLocalRewriteSelectionState = useCallback(() => {
    setIsLocalRewriteModalOpen(false);
    setIsRewriteSelectionMode(false);
    setSelectedRewriteLineIds([]);
    setRewriteSelectionAnchorLineId(null);
  }, []);

  const handleCloseLocalRewriteModal = useCallback(() => {
    setIsLocalRewriteModalOpen(false);
  }, []);

  const handleSelectRewriteLine = useCallback(
    (lineId: string, event: MouseEvent<HTMLDivElement>) => {
      if (!selectedChapter) return;

      const nextSelection = updateRewriteLineSelection({
        lines: selectedChapter.scriptLines,
        lineId,
        selectedLineIds: selectedRewriteLineIds,
        anchorLineId: rewriteSelectionAnchorLineId,
        shiftKey: event.shiftKey,
        toggleSelection: event.ctrlKey || event.metaKey,
      });
      setSelectedRewriteLineIds(nextSelection.selectedLineIds);
      setRewriteSelectionAnchorLineId(nextSelection.anchorLineId);
    },
    [rewriteSelectionAnchorLineId, selectedChapter, selectedRewriteLineIds]
  );

  const handleExitRewriteSelectionMode = useCallback(() => {
    resetLocalRewriteSelectionState();
  }, [resetLocalRewriteSelectionState]);

  const handleLocalRewriteButtonClick = useCallback(() => {
    if (!canStartLocalRewrite) return;

    if (!isRewriteSelectionMode) {
      setIsRewriteSelectionMode(true);
      return;
    }

    if (rewriteSelectedSegments.length === 0) {
      alert(
        '请先在下方点击要重画的脚本块；按住 Shift 可扩展连续范围，按住 Ctrl 可补选不连续的块。'
      );
      return;
    }

    setIsLocalRewriteModalOpen(true);
  }, [canStartLocalRewrite, isRewriteSelectionMode, rewriteSelectedSegments.length]);

  return {
    canStartLocalRewrite,
    handleCloseLocalRewriteModal,
    handleExitRewriteSelectionMode,
    handleLocalRewriteButtonClick,
    handleSelectRewriteLine,
    isLocalRewriteModalOpen,
    isRewriteSelectionMode,
    resetLocalRewriteSelectionState,
    rewriteSelectedBlocks,
    rewriteSelectedSegments,
    selectedRewriteLineIdSet,
  };
};
