import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import type { Chapter } from '../../../../types';

const getTextLengthWithBreaks = (
  node: Node,
  stopAt?: { node: Node; offset: number }
): number => {
  let length = 0;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_ALL, null);
  let current: Node | null = walker.currentNode;

  while (current) {
    if (stopAt && current === stopAt.node) {
      if (current.nodeType === Node.TEXT_NODE) {
        length += (current.textContent || '')
          .slice(0, stopAt.offset)
          .replace(/\u200B/g, '').length;
      }
      break;
    }

    if (current.nodeType === Node.TEXT_NODE) {
      length += (current.textContent || '').replace(/\u200B/g, '').length;
    } else if ((current as HTMLElement).tagName === 'BR') {
      length += 1;
    }

    current = walker.nextNode();
  }

  return length;
};

interface UseScriptEditorSplitActionsOptions {
  handleSplitScriptLine: (
    chapterId: string,
    lineId: string,
    splitIndex: number,
    currentText: string
  ) => void;
  selectedChapter: Chapter | null;
  splitChapterAtLine: (chapterId: string, lineId: string) => void;
}

export const useScriptEditorSplitActions = ({
  handleSplitScriptLine,
  selectedChapter,
  splitChapterAtLine,
}: UseScriptEditorSplitActionsOptions) => {
  const [focusedScriptLineId, setFocusedScriptLineId] = useState<string | null>(
    null
  );
  const lastFocusedLineIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (focusedScriptLineId) {
      lastFocusedLineIdRef.current = focusedScriptLineId;
    }
  }, [focusedScriptLineId]);

  const activeLineIdForChapterSplit = useMemo(() => {
    const candidate = focusedScriptLineId || lastFocusedLineIdRef.current;
    if (!candidate || !selectedChapter) return null;

    return selectedChapter.scriptLines.some((line) => line.id === candidate)
      ? candidate
      : null;
  }, [focusedScriptLineId, selectedChapter]);

  const handleSplitClick = useCallback(() => {
    if (!selectedChapter || !focusedScriptLineId) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    let currentNode: Node | null = range.startContainer;
    let contentEditableElement: HTMLElement | null = null;

    while (currentNode) {
      if (
        currentNode.nodeType === Node.ELEMENT_NODE &&
        (currentNode as HTMLElement).isContentEditable
      ) {
        contentEditableElement = currentNode as HTMLElement;
        break;
      }
      currentNode = currentNode.parentElement;
    }

    if (!contentEditableElement) {
      return;
    }

    const currentText = contentEditableElement.innerText;
    const splitIndex = getTextLengthWithBreaks(contentEditableElement, {
      node: range.startContainer,
      offset: range.startOffset,
    });

    handleSplitScriptLine(
      selectedChapter.id,
      focusedScriptLineId,
      splitIndex,
      currentText
    );
  }, [focusedScriptLineId, handleSplitScriptLine, selectedChapter]);

  const handleSplitMouseDown = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      handleSplitClick();
    },
    [handleSplitClick]
  );

  const handleSplitChapterClick = useCallback(() => {
    if (!selectedChapter || !activeLineIdForChapterSplit) {
      return;
    }

    splitChapterAtLine(selectedChapter.id, activeLineIdForChapterSplit);
  }, [activeLineIdForChapterSplit, selectedChapter, splitChapterAtLine]);

  const handleSplitChapterMouseDown = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      handleSplitChapterClick();
    },
    [handleSplitChapterClick]
  );

  return {
    canSplitChapter: !!activeLineIdForChapterSplit,
    canSplitFocusedLine: !!focusedScriptLineId,
    handleSplitChapterMouseDown,
    handleSplitMouseDown,
    setFocusedScriptLineId,
  };
};
