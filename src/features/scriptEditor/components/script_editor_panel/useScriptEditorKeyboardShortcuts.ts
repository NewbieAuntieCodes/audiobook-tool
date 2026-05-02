import { useEffect, useState } from 'react';
import type { Project } from '../../../../types';
import useStore from '../../../../store/useStore';

interface UseScriptEditorKeyboardShortcutsOptions {
  currentProject: Project | null;
  onAssignCharacterToLine: (
    chapterId: string,
    lineId: string,
    characterId?: string
  ) => void;
}

export const useScriptEditorKeyboardShortcuts = ({
  currentProject,
  onAssignCharacterToLine,
}: UseScriptEditorKeyboardShortcutsOptions) => {
  const [shortcutActiveLineId, setShortcutActiveLineId] = useState<string | null>(
    null
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isModalOpen = useStore.getState().isShortcutSettingsModalOpen;
      if (!shortcutActiveLineId || isModalOpen || !currentProject) return;

      const key = event.key.toLowerCase();
      const shortcuts = useStore.getState().characterShortcuts;
      if (shortcuts && shortcuts[key] !== undefined) {
        const characterId = shortcuts[key];
        const chapter = currentProject.chapters.find((item) =>
          item.scriptLines.some((line) => line.id === shortcutActiveLineId)
        );
        if (chapter) {
          onAssignCharacterToLine(chapter.id, shortcutActiveLineId, characterId);
        }
        event.preventDefault();
      }
      setShortcutActiveLineId(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentProject, onAssignCharacterToLine, shortcutActiveLineId]);

  return {
    shortcutActiveLineId,
    setShortcutActiveLineId,
  };
};
