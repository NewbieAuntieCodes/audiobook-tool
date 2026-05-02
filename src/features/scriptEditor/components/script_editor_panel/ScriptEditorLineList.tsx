import React, { useMemo } from 'react';
import type { Character, CVStylesMap, ScriptLine } from '../../../../types';
import ScriptLineItem from './ScriptLineItem';

interface ScriptEditorLineListProps {
  chapterId: string;
  scriptLines: ScriptLine[];
  characters: Character[];
  characterIdsInChapter: Set<string>;
  cvStyles: CVStylesMap;
  customSoundTypes: string[];
  selectedRewriteLineIdSet: Set<string>;
  shortcutActiveLineId: string | null;
  isRewriteSelectionMode: boolean;
  onUpdateText: (chapterId: string, lineId: string, newText: string) => void;
  onAssignCharacter: (chapterId: string, lineId: string, characterId: string) => void;
  onMergeLines: (chapterId: string, lineId: string) => void;
  onUpdateSoundType: (chapterId: string, lineId: string, soundType: string) => void;
  onFocusChange: (lineId: string | null) => void;
  onActivateShortcutMode: (lineId: string | null) => void;
  onAddCustomSoundType: (soundType: string) => void;
  onDeleteCustomSoundType: (soundType: string) => void;
  onOpenCvModal: (character: Character) => void;
  onMoveLine: (chapterId: string, lineId: string, direction: -1 | 1) => void;
  onSelectForRewrite: (
    lineId: string,
    event: React.MouseEvent<HTMLDivElement>
  ) => void;
}

export default function ScriptEditorLineList({
  chapterId,
  scriptLines,
  characters,
  characterIdsInChapter,
  cvStyles,
  customSoundTypes,
  selectedRewriteLineIdSet,
  shortcutActiveLineId,
  isRewriteSelectionMode,
  onUpdateText,
  onAssignCharacter,
  onMergeLines,
  onUpdateSoundType,
  onFocusChange,
  onActivateShortcutMode,
  onAddCustomSoundType,
  onDeleteCustomSoundType,
  onOpenCvModal,
  onMoveLine,
  onSelectForRewrite,
}: ScriptEditorLineListProps) {
  const scriptLineItems = useMemo(
    () =>
      scriptLines.map((line, index) => (
        <ScriptLineItem
          key={line.id}
          line={line}
          chapterId={chapterId}
          characters={characters}
          characterIdsInChapter={characterIdsInChapter}
          onUpdateText={onUpdateText}
          onAssignCharacter={onAssignCharacter}
          onMergeLines={onMergeLines}
          cvStyles={cvStyles}
          onUpdateSoundType={onUpdateSoundType}
          onFocusChange={onFocusChange}
          isShortcutActive={shortcutActiveLineId === line.id}
          onActivateShortcutMode={onActivateShortcutMode}
          customSoundTypes={customSoundTypes}
          onAddCustomSoundType={onAddCustomSoundType}
          onDeleteCustomSoundType={onDeleteCustomSoundType}
          onOpenCvModal={onOpenCvModal}
          canMoveUp={index > 0}
          canMoveDown={index < scriptLines.length - 1}
          onMoveLine={onMoveLine}
          isSelectionMode={isRewriteSelectionMode}
          isSelectedForRewrite={selectedRewriteLineIdSet.has(line.id)}
          onSelectForRewrite={onSelectForRewrite}
        />
      )),
    [
      chapterId,
      characters,
      characterIdsInChapter,
      customSoundTypes,
      cvStyles,
      isRewriteSelectionMode,
      onActivateShortcutMode,
      onAddCustomSoundType,
      onAssignCharacter,
      onDeleteCustomSoundType,
      onFocusChange,
      onMergeLines,
      onMoveLine,
      onOpenCvModal,
      onSelectForRewrite,
      onUpdateSoundType,
      onUpdateText,
      scriptLines,
      selectedRewriteLineIdSet,
      shortcutActiveLineId,
    ]
  );

  return <>{scriptLineItems}</>;
}
