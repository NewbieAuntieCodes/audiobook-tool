import React, { useState, useMemo } from 'react';
import { Character } from '../../../../types';
import { useEditorContext } from '../../contexts/EditorContext';
import CharacterListHeaderControls from './CharacterListHeaderControls'; 
import CharacterListItemView from './CharacterListItemView'; 
import { useStore } from '../../../../store/useStore'; 
import MergeCharactersModal from '../editor_page_modal/MergeCharactersModal';
import { normalizeCharacterNameKey } from '../../../../lib/characterName';

interface ControlsAndCharactersPanelProps {
  onDeleteCharacter: (characterId: string) => void; 
}

export const ControlsAndCharactersPanel: React.FC<ControlsAndCharactersPanelProps> = ({
  onDeleteCharacter,
}) => {
  const {
    currentProject,
    characters,
    cvStyles,   
    selectedChapterId,
    openCharacterSidePanel,
    openCvModal,
    openCharacterEditModal, 
    generateCharacterProfileWithDeepSeek,
    characterProfileGenerationId,
    characterFilterMode, 
    setCharacterFilterMode, 
  } = useEditorContext();

  const storeCharacters = useStore(state => state.characters);
  const mergeHistory = useStore(state => state.mergeHistory);
  const mergeCharactersAction = useStore(state => state.mergeCharacters);
  const undoLastMergeAction = useStore(state => state.undoLastMerge);
  const deleteCharactersAction = useStore(state => state.deleteCharacters);
  const cleanupDuplicateCharactersInProject = useStore(state => state.cleanupDuplicateCharactersInProject);
  const openConfirmModal = useStore(state => state.openConfirmModal);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCharacterIdsForMerge, setSelectedCharacterIdsForMerge] = useState<string[]>([]);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);

  const charactersToDisplay = useMemo(() => {
    // Important: do NOT dedupe by name here.
    // Duplicates (same name but different ids) must remain visible so users can merge/fix them.
    let uniqueChars = storeCharacters.filter(c => (!c.projectId || c.projectId === currentProject?.id) && c.status !== 'merged');
    
    if (characterFilterMode === 'currentChapter' && currentProject && selectedChapterId) {
      const chapter = currentProject.chapters.find(ch => ch.id === selectedChapterId);
      const characterIdsInChapter = new Set(chapter?.scriptLines.map(line => line.characterId).filter(Boolean) as string[]);
      uniqueChars = uniqueChars.filter(char => characterIdsInChapter.has(char.id));
    }

    if (searchTerm.trim() !== '') {
        const lowercasedSearchTerm = searchTerm.toLowerCase();
        uniqueChars = uniqueChars.filter(char => 
            char.name.toLowerCase().includes(lowercasedSearchTerm) ||
            (char.cvName && char.cvName.toLowerCase().includes(lowercasedSearchTerm))
        );
    }

    // Sort: keep project-scoped roles before global templates for the same name
    uniqueChars = uniqueChars.sort((a, b) => {
      const nameCmp = a.name.localeCompare(b.name, 'zh-Hans-CN');
      if (nameCmp !== 0) return nameCmp;
      const aIsProject = !!a.projectId;
      const bIsProject = !!b.projectId;
      if (aIsProject !== bIsProject) return aIsProject ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
    return uniqueChars;
  }, [storeCharacters, characterFilterMode, currentProject, selectedChapterId, searchTerm]);

  const handleAddNewCharacterClick = () => {
    openCharacterEditModal(null); 
  };
  
  const handleToggleSelectForMerge = (characterId: string) => {
    setSelectedCharacterIdsForMerge(prev =>
      prev.includes(characterId)
        ? prev.filter(id => id !== characterId)
        : [...prev, characterId]
    );
  };

  const handleOpenMergeModal = () => {
    if (selectedCharacterIdsForMerge.length < 2) {
      alert("请至少选择两个角色进行合并。");
      return;
    }
    setIsMergeModalOpen(true);
  };

  const handleConfirmMerge = (targetCharacterId: string) => {
    const sourceIds = selectedCharacterIdsForMerge.filter(id => id !== targetCharacterId);
    if (sourceIds.length === 0 || !targetCharacterId) {
        alert("合并错误：必须有源角色和目标角色。");
        return;
    }
    mergeCharactersAction(sourceIds, targetCharacterId);
    setIsMergeModalOpen(false);
    setSelectedCharacterIdsForMerge([]);
  };

  const handleUndoLastMerge = () => {
    if (mergeHistory.length > 0) {
        undoLastMergeAction();
    } else {
        alert("没有可以撤销的合并操作。");
    }
  };

  const handleBatchDeleteCharacters = () => {
    if (selectedCharacterIdsForMerge.length === 0) {
        alert("请先勾选要删除的角色。");
        return;
    }
    openConfirmModal(
        `批量删除角色确认`,
        `您确定要删除选中的 ${selectedCharacterIdsForMerge.length} 个角色吗？\n所有项目中引用这些角色的台词行，其角色将被重置为“待识别角色”。此操作无法撤销。`,
        () => {
            deleteCharactersAction(selectedCharacterIdsForMerge);
            setSelectedCharacterIdsForMerge([]);
        },
        "确认删除",
        "取消"
    );
  };

  const handleCleanupDuplicateCharacters = () => {
    if (!currentProject) return;

    const projectChars = storeCharacters.filter(
      c => c.projectId === currentProject.id && c.status !== 'merged'
    );

    const groups = new Map<string, Character[]>();
    for (const c of projectChars) {
      const key = normalizeCharacterNameKey(c.name);
      const arr = groups.get(key);
      if (arr) arr.push(c);
      else groups.set(key, [c]);
    }

    const duplicateGroups = Array.from(groups.values()).filter(arr => arr.length > 1);
    const extraCount = duplicateGroups.reduce((sum, arr) => sum + (arr.length - 1), 0);
    if (extraCount === 0) {
      alert('当前项目没有重复角色。');
      return;
    }

    openConfirmModal(
      '清理重复角色（不可撤销）',
      `将在“${currentProject.name}”中删除 ${extraCount} 个重复角色（共 ${duplicateGroups.length} 组同名）。\n` +
        `所有引用这些重复角色的台词将自动改为保留的那一个角色。\n` +
        `此操作不可撤销，建议先导出同步文件做备份。`,
      () => {
        void (async () => {
          const res = await cleanupDuplicateCharactersInProject(currentProject.id);
          setSelectedCharacterIdsForMerge([]);
          alert(`清理完成：删除 ${res.deletedCharacters} 个重复角色，修正 ${res.updatedLines} 行台词（${res.groups} 组）。`);
        })();
      },
      '确认清理',
      '取消',
    );
  };

  return (
    <div className="p-4 h-full flex flex-col bg-slate-800 text-slate-100">
      <CharacterListHeaderControls
        filterMode={characterFilterMode} 
        onSetFilterMode={setCharacterFilterMode} 
        onAddNewCharacter={handleAddNewCharacterClick} 
        selectedCharacterIdsForMerge={selectedCharacterIdsForMerge}
        onMergeSelectedCharacters={handleOpenMergeModal}
        onCleanupDuplicateCharacters={handleCleanupDuplicateCharacters}
        canUndoMerge={mergeHistory.length > 0}
        onUndoLastMerge={handleUndoLastMerge}
        onBatchDeleteCharacters={handleBatchDeleteCharacters}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
      />
      <div className="flex-grow overflow-y-auto space-y-1.5 pr-1">
        {charactersToDisplay.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-3">
            {searchTerm.trim() ? `未找到匹配的角色 "${searchTerm}"。` : (characterFilterMode === 'currentChapter' ? '本章尚未分配角色。' : '项目中还没有角色。')}
          </p>
        ) : (
          charactersToDisplay.map(char => (
            <CharacterListItemView
              key={char.id}
              character={char}
              cvStyles={cvStyles} 
              onOpenCvModal={openCvModal} 
              onOpenCharacterSidePanel={openCharacterSidePanel} 
              onEditCharacter={openCharacterEditModal} 
              onGenerateAiProfile={(character) => {
                void generateCharacterProfileWithDeepSeek(character);
              }}
              onDeleteCharacter={onDeleteCharacter} 
              isGeneratingAiProfile={characterProfileGenerationId === char.id}
              isSelectedForMerge={selectedCharacterIdsForMerge.includes(char.id)}
              onToggleSelectForMerge={handleToggleSelectForMerge}
            />
          ))
        )}
      </div>
      {isMergeModalOpen && selectedCharacterIdsForMerge.length > 0 && (
        <MergeCharactersModal
          isOpen={isMergeModalOpen}
          onClose={() => setIsMergeModalOpen(false)}
          charactersToMerge={storeCharacters.filter(c => selectedCharacterIdsForMerge.includes(c.id))}
          onConfirmMerge={handleConfirmMerge}
        />
      )}
    </div>
  );
};
