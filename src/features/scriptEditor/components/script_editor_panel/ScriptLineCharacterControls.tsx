import React, { useEffect, useRef, useState } from 'react';

import type { Character } from '../../../../types';
import {
  ChevronDownIcon,
  UserCircleIcon,
} from '../../../../components/ui/icons';
import CharacterSelectorDropdown from './CharacterSelectorDropdown';
import {
  getScriptLineCharacterSelectStyle,
  getScriptLineCvButtonStyle,
  getScriptLineCvButtonText,
} from './scriptLineItemStyles';

interface ScriptLineCharacterControlsProps {
  character?: Character;
  isSilentLine: boolean;
  isCharacterMissing: boolean;
  isShortcutActive: boolean;
  isInteractionDisabled: boolean;
  characters: Character[];
  characterIdsInChapter: Set<string>;
  currentLineCharacterId?: string;
  chapterId: string;
  lineId: string;
  cvStyles: Record<string, { bgColor: string; textColor: string }>;
  onActivateShortcutMode: (lineId: string | null) => void;
  onAssignCharacter: (chapterId: string, lineId: string, characterId: string) => void;
  onMergeLines: (chapterId: string, lineId: string) => void;
  onOpenCvModal: (character: Character) => void;
}

const ScriptLineCharacterControls: React.FC<
  ScriptLineCharacterControlsProps
> = ({
  character,
  isSilentLine,
  isCharacterMissing,
  isShortcutActive,
  isInteractionDisabled,
  characters,
  characterIdsInChapter,
  currentLineCharacterId,
  chapterId,
  lineId,
  cvStyles,
  onActivateShortcutMode,
  onAssignCharacter,
  onMergeLines,
  onOpenCvModal,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const charSelectAppliedStyle = getScriptLineCharacterSelectStyle({
    character,
    isCharacterMissing,
    isSilentLine,
  });
  const cvButtonAppliedStyle = getScriptLineCvButtonStyle(character, cvStyles);
  const cvButtonText = getScriptLineCvButtonText(character);
  const characterLabel = isCharacterMissing
    ? '待识别角色'
    : character
      ? character.name === '音效'
        ? '[音效]'
        : character.name
      : '分配角色...';

  return (
    <div
      className={`flex-shrink-0 w-48 space-y-1 ${
        isInteractionDisabled ? 'pointer-events-none opacity-60' : ''
      }`}
    >
      <div className="flex items-center space-x-1 w-full">
        {character && !isSilentLine ? (
          <button
            onClick={() => onOpenCvModal(character)}
            disabled={isInteractionDisabled}
            title={
              character.cvName
                ? `CV: ${character.cvName} (编辑CV与角色样式)`
                : `为角色 ${character.name} 添加CV并编辑样式`
            }
            className={`flex-shrink-0 flex items-center justify-center text-xs px-1.5 py-2 h-9 rounded truncate w-20 ${cvButtonAppliedStyle.className}`}
            style={cvButtonAppliedStyle.style}
            aria-label={`编辑角色 ${character.name} 的CV与样式`}
          >
            <UserCircleIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />
            <span className="truncate">{cvButtonText}</span>
          </button>
        ) : (
          <div className="w-20 h-9 flex-shrink-0" />
        )}
        <div className="relative flex-grow min-w-[80px]" ref={dropdownRef}>
          <div
            className={`relative flex rounded-md border h-9 overflow-hidden ${
              isShortcutActive ? 'ring-2 ring-sky-400' : 'border-slate-600'
            }`}
          >
            <button
              onClick={() => onActivateShortcutMode(lineId)}
              disabled={isInteractionDisabled}
              title="点击激活快捷键模式"
              className={`flex-grow p-2 text-sm text-left outline-none focus:z-10 flex items-center min-w-0 ${charSelectAppliedStyle.className}`}
              style={charSelectAppliedStyle.style}
            >
              <span className="truncate">{characterLabel}</span>
            </button>
            <button
              onClick={() => setIsDropdownOpen((previous) => !previous)}
              disabled={isInteractionDisabled}
              title="打开角色选择菜单"
              className={`flex-shrink-0 px-1 outline-none focus:z-10 border-l border-black/20 ${charSelectAppliedStyle.className}`}
              style={charSelectAppliedStyle.style}
              aria-haspopup="listbox"
              aria-expanded={isDropdownOpen}
            >
              <ChevronDownIcon className="w-4 h-4 text-current opacity-70" />
            </button>
          </div>
          {!isInteractionDisabled && isDropdownOpen && (
            <CharacterSelectorDropdown
              characters={characters}
              characterIdsInChapter={characterIdsInChapter}
              currentLineCharacterId={currentLineCharacterId}
              onSelectCharacter={(characterId) => {
                onAssignCharacter(chapterId, lineId, characterId);
                setIsDropdownOpen(false);
              }}
              onMergeLines={() => {
                onMergeLines(chapterId, lineId);
                setIsDropdownOpen(false);
              }}
              onClose={() => setIsDropdownOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ScriptLineCharacterControls;
