import React, { useMemo } from 'react';
import ImportAnnotationModal from './editor_page_modal/ImportAnnotationModal';
import AddChaptersModal from './chapter_list_panel/AddChaptersModal';
import ShortcutSettingsModal from './editor_page_modal/ShortcutSettingsModal';
import { useEditorContext } from '../contexts/EditorContext';
import useStore from '../../../store/useStore';

interface EditorModalsProps {
  isAddChaptersModalOpen: boolean;
  onCloseAddChaptersModal: () => void;
  onSaveNewChapters: (pastedText: string) => void;
  isImportModalOpen: boolean;
  onCloseImportModal: () => void;
  onImportAndCvUpdate: (annotatedText: string) => Promise<void>;
  onAutoImportWithCodex: () => Promise<void>;
  onAutoImportWithLocalCodex: () => Promise<void>;
  onAutoImportWithDeepSeek: (mode: 'flash' | 'pro') => Promise<void>;
  isLocalCodexTaskRunning?: boolean;
}

const EditorModals: React.FC<EditorModalsProps> = ({
  isAddChaptersModalOpen,
  onCloseAddChaptersModal,
  onSaveNewChapters,
  isImportModalOpen,
  onCloseImportModal,
  onImportAndCvUpdate,
  onAutoImportWithCodex,
  onAutoImportWithLocalCodex,
  onAutoImportWithDeepSeek,
  isLocalCodexTaskRunning = false,
}) => {
  const { currentProject, selectedChapterId, multiSelectedChapterIds, characters } = useEditorContext();
  const { isShortcutSettingsModalOpen, closeShortcutSettingsModal } = useStore();

  const chapterContentForAiPrompt = useMemo(() => {
    if (!currentProject) return '';
    const idsToProcess = multiSelectedChapterIds.length > 0 ? multiSelectedChapterIds : selectedChapterId ? [selectedChapterId] : [];
    if (idsToProcess.length === 0) return '';
    const sortedIds = [...idsToProcess].sort((a, b) => {
      const indexA = currentProject.chapters.findIndex(ch => ch.id === a);
      const indexB = currentProject.chapters.findIndex(ch => ch.id === b);
      return indexA - indexB;
    });
    return sortedIds.map(id => currentProject.chapters.find(ch => ch.id === id)?.rawContent || '').join('\n\n--- CHAPTER BREAK ---\n\n');
  }, [currentProject, selectedChapterId, multiSelectedChapterIds]);

  const characterIdsInChapterForModal = useMemo(() => {
    const selectedChapter = currentProject?.chapters.find(ch => ch.id === selectedChapterId);
    if (!selectedChapter) return new Set<string>();
    return new Set(selectedChapter.scriptLines.map(line => line.characterId).filter((id): id is string => !!id));
  }, [selectedChapterId, currentProject]);

  return (
    <>
      <ImportAnnotationModal
        isOpen={isImportModalOpen}
        onClose={onCloseImportModal}
        onSubmit={onImportAndCvUpdate}
        onAutoAnnotate={onAutoImportWithCodex}
        onAutoAnnotateWithLocalCodex={onAutoImportWithLocalCodex}
        onAutoAnnotateWithDeepSeek={onAutoImportWithDeepSeek}
        isLoading={useEditorContext().isLoadingImportAnnotation}
        chapterContentToCopy={chapterContentForAiPrompt}
        isLocalCodexTaskRunning={isLocalCodexTaskRunning}
      />
      <AddChaptersModal 
        isOpen={isAddChaptersModalOpen}
        onClose={onCloseAddChaptersModal}
        onSave={onSaveNewChapters}
      />
      <ShortcutSettingsModal
        isOpen={isShortcutSettingsModalOpen}
        onClose={closeShortcutSettingsModal}
        allCharacters={characters}
        characterIdsInChapter={characterIdsInChapterForModal}
      />
    </>
  );
};

export default EditorModals;
