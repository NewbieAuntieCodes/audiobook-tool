import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import type { Chapter } from '../../../../types';
import {
  getActiveElementDebugInfo,
  logEditorFocusDebug,
} from './editorFocusDebug';

interface UseScriptEditorHeaderStateOptions {
  selectedChapter: Chapter | null;
  resetLocalRewriteSelectionState: () => void;
  undoableUpdateChapterTitle: (chapterId: string, title: string) => void;
  undoableUpdateChapterRawContent: (
    chapterId: string,
    rawContent: string
  ) => void;
}

export const useScriptEditorHeaderState = ({
  selectedChapter,
  resetLocalRewriteSelectionState,
  undoableUpdateChapterTitle,
  undoableUpdateChapterRawContent,
}: UseScriptEditorHeaderStateOptions) => {
  const [isEditingHeaderTitle, setIsEditingHeaderTitle] = useState(false);
  const [headerTitleInput, setHeaderTitleInput] = useState('');
  const headerTitleInputRef = useRef<HTMLInputElement>(null);
  const [editableRawContent, setEditableRawContent] = useState('');
  const [isRawContentDirty, setIsRawContentDirty] = useState(false);
  const previousSelectedChapterIdRef = useRef<string | null>(null);

  useEffect(() => {
    const previousSelectedChapterId = previousSelectedChapterIdRef.current;
    if (selectedChapter?.id || previousSelectedChapterId) {
      logEditorFocusDebug('selectedChapter switch sync effect triggered', {
        selectedChapterId: selectedChapter?.id || '',
        previousChapterId: previousSelectedChapterId || '',
        activeElement: getActiveElementDebugInfo(),
      });
    }

    if (selectedChapter) {
      setHeaderTitleInput(selectedChapter.title);
      setIsEditingHeaderTitle(false);
      setEditableRawContent(selectedChapter.rawContent);
      setIsRawContentDirty(false);
      resetLocalRewriteSelectionState();
    } else {
      setHeaderTitleInput('');
      setEditableRawContent('');
      setIsRawContentDirty(false);
      setIsEditingHeaderTitle(false);
      resetLocalRewriteSelectionState();
    }
    previousSelectedChapterIdRef.current = selectedChapter?.id || null;
  }, [resetLocalRewriteSelectionState, selectedChapter?.id]);

  useEffect(() => {
    if (!selectedChapter || isEditingHeaderTitle) {
      return;
    }

    setHeaderTitleInput((prevTitle) =>
      prevTitle === selectedChapter.title ? prevTitle : selectedChapter.title
    );
  }, [isEditingHeaderTitle, selectedChapter?.id, selectedChapter?.title]);

  useEffect(() => {
    if (!selectedChapter || isRawContentDirty) {
      return;
    }

    setEditableRawContent((prevContent) =>
      prevContent === selectedChapter.rawContent
        ? prevContent
        : selectedChapter.rawContent
    );
  }, [isRawContentDirty, selectedChapter?.id, selectedChapter?.rawContent]);

  useEffect(() => {
    if (isEditingHeaderTitle && headerTitleInputRef.current) {
      headerTitleInputRef.current.focus();
      headerTitleInputRef.current.select();
    }
  }, [isEditingHeaderTitle]);

  const handleHeaderTitleInputChange = useCallback((value: string) => {
    setHeaderTitleInput(value);
  }, []);

  const handleHeaderTitleClick = useCallback(() => {
    if (!selectedChapter) return;
    logEditorFocusDebug('header title edit start', {
      selectedChapterId: selectedChapter.id,
      titleLength: selectedChapter.title.length,
      activeElement: getActiveElementDebugInfo(),
    });
    setHeaderTitleInput(selectedChapter.title);
    setIsEditingHeaderTitle(true);
  }, [selectedChapter]);

  const handleHeaderTitleBlur = useCallback(() => {
    if (!selectedChapter) return;
    const trimmedTitle = headerTitleInput.trim();
    logEditorFocusDebug('header title save requested', {
      selectedChapterId: selectedChapter.id,
      beforeTitleLength: selectedChapter.title.length,
      nextTitleLength: trimmedTitle.length,
      activeElement: getActiveElementDebugInfo(),
    });
    if (trimmedTitle) {
      undoableUpdateChapterTitle(selectedChapter.id, trimmedTitle);
    } else {
      setHeaderTitleInput(selectedChapter.title);
      alert('章节标题不能为空。');
    }
    setIsEditingHeaderTitle(false);
  }, [headerTitleInput, selectedChapter, undoableUpdateChapterTitle]);

  const handleHeaderTitleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleHeaderTitleBlur();
      } else if (event.key === 'Escape') {
        if (selectedChapter) setHeaderTitleInput(selectedChapter.title);
        setIsEditingHeaderTitle(false);
      }
    },
    [handleHeaderTitleBlur, selectedChapter]
  );

  const handleRawContentChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setEditableRawContent(event.target.value);
      if (!isRawContentDirty) setIsRawContentDirty(true);
      logEditorFocusDebug('raw content change', {
        selectedChapterId: selectedChapter?.id || '',
        nextLength: event.target.value.length,
        wasDirty: isRawContentDirty,
        activeElement: getActiveElementDebugInfo(),
      });
    },
    [isRawContentDirty, selectedChapter?.id]
  );

  const handleSaveRawContent = useCallback(() => {
    if (selectedChapter && isRawContentDirty) {
      logEditorFocusDebug('raw content save requested', {
        selectedChapterId: selectedChapter.id,
        rawContentLength: editableRawContent.length,
        activeElement: getActiveElementDebugInfo(),
      });
      undoableUpdateChapterRawContent(selectedChapter.id, editableRawContent);
      setIsRawContentDirty(false);
    }
  }, [
    editableRawContent,
    isRawContentDirty,
    selectedChapter,
    undoableUpdateChapterRawContent,
  ]);

  return {
    editableRawContent,
    handleHeaderTitleBlur,
    handleHeaderTitleClick,
    handleHeaderTitleInputChange,
    handleHeaderTitleKeyDown,
    handleRawContentChange,
    handleSaveRawContent,
    headerTitleInput,
    headerTitleInputRef,
    isEditingHeaderTitle,
    isRawContentDirty,
  };
};
