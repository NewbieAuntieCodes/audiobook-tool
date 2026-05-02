import React, { createContext, useContext } from 'react';
import { Project, Character, ScriptLine, Chapter, CharacterFilterMode, SoundLibraryItem, IgnoredSoundKeyword, PinnedSound } from '../../../types';
import { CVStylesMap } from '../../../types';

export interface EditorContextType {
  currentProject: Project | null; 
  characters: Character[];
  allCvNames: string[];
  cvStyles: CVStylesMap;
  
  undoableProjectUpdate: (updater: (prevProject: Project) => Project) => void;
  undoableParseProjectChapters: () => void;
  undoableUpdateChapterTitle: (chapterId: string, newTitle: string) => void;
  undoableUpdateChapterRawContent: (chapterId: string, newRawContent: string) => void;
  deleteChapters: (chapterIds: string[]) => void;
  mergeChapters: (chapterIds: string[], targetChapterId: string) => void;
  insertChapterAfter: (afterChapterId: string) => void;
  splitChapterAtLine: (chapterId: string, lineId: string) => void;
  batchAddChapters: (count: number) => void;
  
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  selectedChapterId: string | null;
  setSelectedChapterId: (id: string | null) => void;
  multiSelectedChapterIds: string[];
  setMultiSelectedChapterIds: React.Dispatch<React.SetStateAction<string[]>>;
  selectedLineForPlayback: ScriptLine | null;
  setSelectedLineForPlayback: React.Dispatch<React.SetStateAction<ScriptLine | null>>;
  
  isLoadingAiAnnotation: boolean;
  isLoadingManualParse: boolean;
  isLoadingImportAnnotation: boolean;
  isLocalCodexTaskRunning: boolean;
  localCodexTaskStatus: {
    taskId?: string;
    kind?: 'role_sync';
    visible: boolean;
    phase: 'idle' | 'queued' | 'running' | 'success' | 'error' | 'cancelled';
    title: string;
    message: string;
    detail: string;
    createdAt?: number;
    updatedAt?: number;
    currentChapterNumber: number;
    totalChapterCount: number;
    isCancelling: boolean;
    canResume: boolean;
    resumeLabel: string;
  };
  cancelLocalCodexTask: () => Promise<void>;
  resumeLocalCodexTask: () => Promise<void>;
  dismissLocalCodexTaskStatus: () => void;
  runAiAnnotationForChapters: (chapterIds: string[]) => Promise<void>;
  runManualParseForChapters: (chapterIds: string[]) => Promise<void>;
  openImportModal: () => void;
  openAddChaptersModal: () => void;
  openScriptImport: () => void;
  saveNewChapters: (pastedText: string) => void;
  openShortcutSettingsModal: () => void;

  characterFilterMode: CharacterFilterMode;
  setCharacterFilterMode: React.Dispatch<React.SetStateAction<CharacterFilterMode>>;
  cvFilter: string | null;
  setCvFilter: (cvName: string | null) => void;
  openCharacterSidePanel: (character: Character) => void;
  openCvModal: (character: Character | null) => void; 
  openCharacterEditModal: (character: Character | null) => void;
  generateCharacterProfileWithDeepSeek: (character: Character) => Promise<void>;
  characterProfileGenerationId: string | null;
  addCustomSoundType: (soundType: string) => void;
  deleteCustomSoundType: (soundType: string) => void;
  addIgnoredSoundKeyword: (projectId: string, chapterId: string, lineId: string, keyword: IgnoredSoundKeyword) => Promise<void>;
  handlePinSound: (chapterId: string, lineId: string, charIndex: number, keyword: string, soundId: number | null, soundName: string | null) => void;

  // Sound Assistant
  soundLibrary: SoundLibraryItem[];
  soundObservationList: string[];
}

export const EditorContext = createContext<EditorContextType | undefined>(undefined);

export const useEditorContext = (): EditorContextType => {
  const context = useContext(EditorContext);
  if (context === undefined) {
    throw new Error('useEditorContext must be used within an EditorProvider provided by EditorPage');
  }
  return context;
};
