import React from 'react';
import { ScriptLine, Character } from '../../../../types';
import { getActiveElementDebugInfo, logEditorFocusDebug } from './editorFocusDebug';
import ScriptLineCharacterControls from './ScriptLineCharacterControls';
import ScriptLineSoundTypeControls from './ScriptLineSoundTypeControls';
import { useScriptLineContentEditable } from './useScriptLineContentEditable';

interface ScriptLineItemProps {
  line: ScriptLine;
  chapterId: string;
  characters: Character[];
  characterIdsInChapter: Set<string>;
  onUpdateText: (chapterId: string, lineId: string, newText: string) => void;
  onAssignCharacter: (chapterId: string, lineId: string, characterId: string) => void;
  onMergeLines: (chapterId: string, lineId: string) => void;
  cvStyles: Record<string, { bgColor: string, textColor: string }>;
  onUpdateSoundType: (chapterId: string, lineId: string, soundType: string) => void;
  onFocusChange: (lineId: string | null) => void; 
  isShortcutActive?: boolean;
  onActivateShortcutMode: (lineId: string | null) => void;
  customSoundTypes: string[];
  onAddCustomSoundType: (soundType: string) => void;
  onDeleteCustomSoundType: (soundType: string) => void;
  onOpenCvModal: (character: Character) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveLine: (chapterId: string, lineId: string, direction: -1 | 1) => void;
  isSelectionMode?: boolean;
  isSelectedForRewrite?: boolean;
  onSelectForRewrite?: (
    lineId: string,
    event: React.MouseEvent<HTMLDivElement>
  ) => void;
}
const logScriptLineFocusDebug = (
  message: string,
  payload: Record<string, unknown>
) => {
  logEditorFocusDebug(`[ScriptLine] ${message}`, payload);
};

const ScriptLineItem: React.FC<ScriptLineItemProps> = ({
  line,
  chapterId,
  characters,
  characterIdsInChapter,
  onUpdateText,
  onAssignCharacter,
  onMergeLines,
  cvStyles,
  onUpdateSoundType,
  onFocusChange,
  isShortcutActive = false,
  onActivateShortcutMode,
  customSoundTypes,
  onAddCustomSoundType,
  onDeleteCustomSoundType,
  onOpenCvModal,
  canMoveUp = true,
  canMoveDown = true,
  onMoveLine,
  isSelectionMode = false,
  isSelectedForRewrite = false,
  onSelectForRewrite,
}) => {
  const character = characters.find(c => c.id === line.characterId);
  const isCharacterMissing = Boolean(line.characterId && !character);
  const isSilentLine = Boolean(character && character.name === '[静音]');
  const {
    contentEditableRef,
    contentEditablePresentation,
    handleDivFocus,
    handleDivBlur,
    handleInput,
  } = useScriptLineContentEditable({
    line,
    chapterId,
    character,
    isSilentLine,
    isSelectionMode,
    onFocusChange,
    onUpdateText,
  });

  const isInteractionDisabled = isSelectionMode;

  const handleRootClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isSelectionMode || !onSelectForRewrite) return;
    logScriptLineFocusDebug('selection mode click intercepted', {
      lineId: line.id,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      activeElement: getActiveElementDebugInfo(),
    });
    onSelectForRewrite(line.id, event);
  };

  return (
    <div
      onClick={handleRootClick}
      className={`p-3 mb-2 rounded-lg border flex items-start gap-3 transition-all duration-150 ${
        isSilentLine ? 'border-slate-800 opacity-70' : 'border-slate-700'
      } ${isSelectionMode ? 'cursor-pointer' : ''} ${
        isSelectedForRewrite
          ? 'border-amber-400 ring-2 ring-amber-400/70 bg-amber-500/10'
          : isSelectionMode
          ? 'hover:border-amber-500/70 hover:bg-slate-700/30'
          : 'hover:border-slate-600'
      } ${line.isAiAudioLoading ? 'opacity-70' : ''} ${
        isShortcutActive ? 'ring-2 ring-amber-400' : ''
      }`}
    >
      <ScriptLineCharacterControls
        character={character}
        isSilentLine={isSilentLine}
        isCharacterMissing={isCharacterMissing}
        isShortcutActive={isShortcutActive}
        isInteractionDisabled={isInteractionDisabled}
        characters={characters}
        characterIdsInChapter={characterIdsInChapter}
        currentLineCharacterId={line.characterId}
        chapterId={chapterId}
        lineId={line.id}
        cvStyles={cvStyles}
        onActivateShortcutMode={onActivateShortcutMode}
        onAssignCharacter={onAssignCharacter}
        onMergeLines={onMergeLines}
        onOpenCvModal={onOpenCvModal}
      />
      <div 
        className="relative flex-grow"
      >
        <div
            ref={contentEditableRef}
            contentEditable={!isInteractionDisabled}
            suppressContentEditableWarning
            spellCheck={false}
            onFocus={handleDivFocus}
            onBlur={handleDivBlur}
            onInput={handleInput}
            className={`${contentEditablePresentation.className} ${isInteractionDisabled ? 'cursor-pointer select-none' : ''}`}
            style={contentEditablePresentation.style}
            aria-label={`脚本行文本: ${line.text.substring(0,50)}... ${character ? `角色: ${character.name}` : '未分配角色'}`}
        />
      </div>
      <ScriptLineSoundTypeControls
        chapterId={chapterId}
        lineId={line.id}
        soundType={line.soundType}
        customSoundTypes={customSoundTypes}
        isInteractionDisabled={isInteractionDisabled}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onUpdateSoundType={onUpdateSoundType}
        onAddCustomSoundType={onAddCustomSoundType}
        onDeleteCustomSoundType={onDeleteCustomSoundType}
        onMoveLine={onMoveLine}
      />
    </div>
  );
};

const areScriptLineItemPropsEqual = (
  prevProps: Readonly<ScriptLineItemProps>,
  nextProps: Readonly<ScriptLineItemProps>
) =>
  prevProps.line === nextProps.line &&
  prevProps.chapterId === nextProps.chapterId &&
  prevProps.characters === nextProps.characters &&
  prevProps.characterIdsInChapter === nextProps.characterIdsInChapter &&
  prevProps.cvStyles === nextProps.cvStyles &&
  prevProps.isShortcutActive === nextProps.isShortcutActive &&
  prevProps.customSoundTypes === nextProps.customSoundTypes &&
  prevProps.canMoveUp === nextProps.canMoveUp &&
  prevProps.canMoveDown === nextProps.canMoveDown &&
  prevProps.isSelectionMode === nextProps.isSelectionMode &&
  prevProps.isSelectedForRewrite === nextProps.isSelectedForRewrite;

export default React.memo(ScriptLineItem, areScriptLineItemPropsEqual);
