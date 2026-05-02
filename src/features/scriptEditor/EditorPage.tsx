import React from 'react';
import { Project, Character } from '../../types';

// Components
import ResizablePanels from '../../components/ui/ResizablePanels';
import ChapterListPanel from './components/chapter_list_panel/ChapterListPanel';
import ScriptEditorPanel from './components/script_editor_panel/ScriptEditorPanel';
import { ControlsAndCharactersPanel } from './components/character_panel/ControlsAndCharactersPanel';
import CharacterDetailsSidePanel from './components/character_side_panel/CharacterDetailsSidePanel';
import EditorModals from './components/EditorModals';
import LocalCodexTaskStatusBar from './components/LocalCodexTaskStatusBar';

// Hooks
import { useEditorPageLogic } from './hooks/useEditorPageLogic';

// Context
import { EditorContext } from './contexts/EditorContext';

interface EditorPageProps {
  projectId: string;
  projects: Project[];
  characters: Character[];
  onProjectUpdate: (project: Project) => void;
  onAddCharacter: (characterData: Pick<Character, 'name' | 'color' | 'textColor' | 'cvName' | 'description' | 'profile' | 'isStyleLockedToCv'>, projectId: string) => Character;
  onDeleteCharacter: (characterId: string) => void;
  onToggleCharacterStyleLock: (characterId: string) => void;
  onBulkUpdateCharacterStylesForCV: (cvName: string, newBgColor: string, newTextColor: string) => void;
  onNavigateToDashboard: () => void;
  onOpenCharacterAndCvStyleModal: (character: Character | null) => void;
  onEditCharacter: (characterBeingEdited: Character, updatedCvName?: string, updatedCvBgColor?: string, updatedCvTextColor?: string) => Promise<void>;
}

const EditorPage: React.FC<EditorPageProps> = (props) => {
  const {
    contextValue,
    isLoadingProject,
    currentProject,
    characterForSidePanel,
    handleCloseCharacterSidePanel,
    isAddChaptersModalOpen,
    setIsAddChaptersModalOpen,
    handleSaveNewChapters,
    isImportModalOpen,
    isLocalCodexTaskRunning,
    localCodexTaskStatus,
    dismissLocalCodexTaskStatus,
    cancelLocalCodexTask,
    handleResumeLocalCodexTaskAndCvUpdate,
    setIsImportModalOpen,
    handleImportAndCvUpdate,
    handleAutoImportWithCodexAndCvUpdate,
    handleAutoImportWithDeepSeekAndCvUpdate,
    handleAutoImportWithLocalCodexAndCvUpdate,
  } = useEditorPageLogic(props);

  if (isLoadingProject) {
    return <div className="p-4 h-full flex items-center justify-center bg-slate-900 text-slate-400">Loading project...</div>;
  }

  if (!currentProject) {
    return <div className="p-4 h-full flex items-center justify-center bg-slate-900 text-slate-400">Project not found. Please return to the dashboard.</div>;
  }

  return (
    <EditorContext.Provider value={contextValue}>
      <div className="flex h-full w-full">
        <ResizablePanels
          leftPanel={
            <ResizablePanels
              leftPanel={<ChapterListPanel />}
              rightPanel={<ScriptEditorPanel />}
              initialLeftWidthPercent={26.7}
              resizeMode="commit"
            />
          }
          rightPanel={
            <ControlsAndCharactersPanel
              onDeleteCharacter={props.onDeleteCharacter}
            />
          }
          initialLeftWidthPercent={75}
          resizeMode="commit"
        />
        <CharacterDetailsSidePanel
          character={characterForSidePanel}
          project={currentProject}
          onClose={handleCloseCharacterSidePanel}
          onEditCharacter={(char) => props.onOpenCharacterAndCvStyleModal(char)}
          onEditCv={(char) => props.onOpenCharacterAndCvStyleModal(char)}
          onSelectChapter={contextValue.setSelectedChapterId}
          cvStyles={contextValue.cvStyles}
        />
        <EditorModals
          isAddChaptersModalOpen={isAddChaptersModalOpen}
          onCloseAddChaptersModal={() => setIsAddChaptersModalOpen(false)}
          onSaveNewChapters={handleSaveNewChapters}
          isImportModalOpen={isImportModalOpen}
          onCloseImportModal={() => setIsImportModalOpen(false)}
          onImportAndCvUpdate={handleImportAndCvUpdate}
          onAutoImportWithCodex={handleAutoImportWithCodexAndCvUpdate}
          onAutoImportWithLocalCodex={handleAutoImportWithLocalCodexAndCvUpdate}
          onAutoImportWithDeepSeek={handleAutoImportWithDeepSeekAndCvUpdate}
          isLocalCodexTaskRunning={isLocalCodexTaskRunning}
        />
        <LocalCodexTaskStatusBar
          status={localCodexTaskStatus}
          onCancel={() => {
            void cancelLocalCodexTask();
          }}
          onResume={() => {
            void handleResumeLocalCodexTaskAndCvUpdate();
          }}
          onDismiss={dismissLocalCodexTaskStatus}
        />
      </div>
    </EditorContext.Provider>
  );
};

export default EditorPage;
