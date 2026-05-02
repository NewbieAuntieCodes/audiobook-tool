import React, { useEffect, useRef, useState } from 'react';

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  XMarkIcon,
} from '../../../../components/ui/icons';

interface ScriptLineSoundTypeControlsProps {
  chapterId: string;
  lineId: string;
  soundType?: string;
  customSoundTypes: string[];
  isInteractionDisabled: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onUpdateSoundType: (chapterId: string, lineId: string, soundType: string) => void;
  onAddCustomSoundType: (soundType: string) => void;
  onDeleteCustomSoundType: (soundType: string) => void;
  onMoveLine: (chapterId: string, lineId: string, direction: -1 | 1) => void;
}

const DEFAULT_SOUND_OPTIONS = ['清除', 'OS', '电话音', '系统音', '广播'];

const ScriptLineSoundTypeControls: React.FC<
  ScriptLineSoundTypeControlsProps
> = ({
  chapterId,
  lineId,
  soundType,
  customSoundTypes,
  isInteractionDisabled,
  canMoveUp,
  canMoveDown,
  onUpdateSoundType,
  onAddCustomSoundType,
  onDeleteCustomSoundType,
  onMoveLine,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const soundOptions = [...DEFAULT_SOUND_OPTIONS, ...customSoundTypes, '自定义'];
  const isLit = Boolean(soundType && soundType !== '清除');

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

  const handleToggleOS = () => {
    onUpdateSoundType(chapterId, lineId, soundType === 'OS' ? '' : 'OS');
  };

  const handleAddCustom = () => {
    const newSoundType = prompt('请输入新的音效类型:', '');
    if (newSoundType && newSoundType.trim() !== '') {
      onAddCustomSoundType(newSoundType.trim());
    }
    setIsDropdownOpen(false);
  };

  return (
    <div
      className={`flex-shrink-0 flex items-center gap-1.5 ${
        isInteractionDisabled ? 'pointer-events-none opacity-60' : ''
      }`}
    >
      <div className="relative" ref={dropdownRef}>
        <div className="flex w-20 h-9 rounded-md border border-slate-600 overflow-hidden">
          <button
            onClick={handleToggleOS}
            disabled={isInteractionDisabled}
            className={`flex-grow h-full flex items-center justify-center px-2 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:z-10 ${
              isLit
                ? 'bg-orange-500 text-white font-semibold'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
            }`}
          >
            <span className="truncate">{soundType || 'OS'}</span>
          </button>
          <button
            onClick={() => setIsDropdownOpen((previous) => !previous)}
            disabled={isInteractionDisabled}
            className={`flex-shrink-0 h-full flex items-center justify-center px-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:z-10 border-l ${
              isLit
                ? 'bg-orange-500 hover:bg-orange-600 text-white border-orange-600'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-300 border-slate-600'
            }`}
            aria-label="选择音效"
          >
            <ChevronDownIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        {!isInteractionDisabled && isDropdownOpen && (
          <div className="absolute z-20 mt-1 w-full bg-slate-800 rounded-md shadow-lg border border-slate-600 max-h-60 overflow-y-auto">
            <ul className="py-1">
              {soundOptions.map((option) => {
                const isCustom =
                  !DEFAULT_SOUND_OPTIONS.includes(option) && option !== '自定义';
                const isSelected =
                  soundType === option ||
                  ((!soundType || soundType === '') && option === '旁白');

                const handleOptionClick = () => {
                  if (option === '自定义') {
                    handleAddCustom();
                    return;
                  }

                  onUpdateSoundType(
                    chapterId,
                    lineId,
                    option === '旁白' ? '' : option
                  );
                  setIsDropdownOpen(false);
                };

                const handleDeleteClick = (event: React.MouseEvent) => {
                  event.stopPropagation();
                  if (
                    window.confirm(
                      `确定要删除自定义音效 "${option}" 并停止使用吗？`
                    )
                  ) {
                    onDeleteCustomSoundType(option);
                  }
                };

                return (
                  <li
                    key={option}
                    onClick={handleOptionClick}
                    className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer group ${
                      isSelected
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    <span>{option}</span>
                    {isCustom && (
                      <button
                        onClick={handleDeleteClick}
                        className="p-1 -mr-2 rounded-full text-slate-500 group-hover:text-red-400 hover:bg-slate-600"
                        title={`删除 "${option}"`}
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      <div className="flex flex-col">
        <button
          onClick={() => onMoveLine(chapterId, lineId, -1)}
          disabled={isInteractionDisabled || !canMoveUp}
          className="p-0.5 text-slate-400 hover:text-sky-300 disabled:text-slate-600 disabled:cursor-not-allowed"
          title="上移此行"
        >
          <ArrowUpIcon className="w-5 h-5" />
        </button>
        <button
          onClick={() => onMoveLine(chapterId, lineId, 1)}
          disabled={isInteractionDisabled || !canMoveDown}
          className="p-0.5 text-slate-400 hover:text-sky-300 disabled:text-slate-600 disabled:cursor-not-allowed"
          title="下移此行"
        >
          <ArrowDownIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default ScriptLineSoundTypeControls;
