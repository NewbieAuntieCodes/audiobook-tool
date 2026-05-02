import React, { useCallback, useMemo, useState } from 'react';
import { Character, Project } from '../../../../types';
import { PencilIcon, UserCircleIcon, BookOpenIcon, XMarkIcon } from '../../../../components/ui/icons';
import { isHexColor, getContrastingTextColor } from '../../../../lib/colorUtils';
// Fix: Import from types.ts to break circular dependency
import { CVStylesMap } from '../../../../types';
import BatchReassignCharacterModal from './BatchReassignCharacterModal';
import FixUnassignedToUnknownModal from './FixUnassignedToUnknownModal';
import { useEditorContext } from '../../contexts/EditorContext';

interface CharacterAppearance {
  chapterId: string;
  chapterTitle: string;
  lineCount: number;
}

interface CharacterDetailsSidePanelProps {
  character: Character | null;
  project: Project | null;
  onClose: () => void;
  onEditCharacter: (character: Character) => void; // Opens unified modal
  onEditCv: (character: Character) => void; // Also opens unified modal
  onSelectChapter: (chapterId: string) => void;
  cvStyles: CVStylesMap;
}

const CharacterDetailsSidePanel: React.FC<CharacterDetailsSidePanelProps> = ({
  character,
  project,
  onClose,
  onEditCharacter, // Will call handleOpenCharacterAndCvStyleModal
  onEditCv,       // Will also call handleOpenCharacterAndCvStyleModal
  onSelectChapter,
  cvStyles,
}) => {
  const { undoableProjectUpdate, characters: contextCharacters } = useEditorContext();
  const [isBatchReassignOpen, setIsBatchReassignOpen] = useState(false);
  const [isFixUnassignedOpen, setIsFixUnassignedOpen] = useState(false);
  const profileRows = [
    ['年龄/年龄段', character?.profile?.age],
    ['性别', character?.profile?.gender],
    ['身份/职业', character?.profile?.occupation],
    ['性格', character?.profile?.personality],
    ['声线建议', character?.profile?.voiceDirection],
    ['人物关系', character?.profile?.relationships],
    ['其他', character?.profile?.notes],
  ].filter(([, value]) => typeof value === 'string' && value.trim() !== '');

  const characterAppearances = useMemo((): CharacterAppearance[] => {
    if (!character || !project || !project.chapters) return [];
    
    return project.chapters.reduce((acc, chapter) => {
      const count = chapter.scriptLines.filter(line => line.characterId === character.id).length;
      if (count > 0) {
        acc.push({ chapterId: chapter.id, chapterTitle: chapter.title, lineCount: count });
      }
      return acc;
    }, [] as CharacterAppearance[]);
  }, [character, project]);

  // Hooks must always be called, even when `character` is null (side panel closed).
  const validCharacterIds = useMemo(() => {
    if (!project) return new Set<string>();
    const ids = new Set<string>();
    contextCharacters.forEach((c) => {
      if (c.status === 'merged') return;
      if (!c.projectId || c.projectId === project.id) ids.add(c.id);
    });
    return ids;
  }, [contextCharacters, project]);

  const isLineUnassignedOrInvalid = useCallback(
    (chapterIndex: number, lineId: string): boolean => {
      if (!project) return false;
      const chapter = project.chapters[chapterIndex];
      const line = chapter?.scriptLines.find((l) => l.id === lineId);
      if (!line) return false;
      const cid = line.characterId || '';
      if (!cid) return true;
      return !validCharacterIds.has(cid);
    },
    [project, validCharacterIds],
  );

  if (!character) {
    return null; 
  }

  // Character's own style
  const charBgIsHex = isHexColor(character.color);
  const charTextIsHex = isHexColor(character.textColor || '');
  const charBgStyle = charBgIsHex ? { backgroundColor: character.color } : {};
  let charTextStyle = charTextIsHex ? { color: character.textColor } : {};
  const charBgClass = !charBgIsHex ? character.color : '';
  let charTextClass = !charTextIsHex ? (character.textColor || '') : '';
  if (charBgIsHex && (!character.textColor || !isHexColor(character.textColor))) {
    charTextStyle = { color: getContrastingTextColor(character.color) };
    charTextClass = '';
  } else if (!character.textColor) {
    charTextClass = 'text-slate-100'; 
  }

  // CV related styles from global cvStyles map
  const cvName = character.cvName;
  let globalCvBgColor = '';
  let globalCvTextColor = '';
  if (cvName && cvStyles[cvName]) {
    globalCvBgColor = cvStyles[cvName].bgColor;
    globalCvTextColor = cvStyles[cvName].textColor;
  } else if (cvName) { // CV name exists but no specific global style
    globalCvBgColor = 'bg-slate-700'; 
    globalCvTextColor = 'text-slate-300'; 
  }
  const cvBgIsHex = isHexColor(globalCvBgColor);
  const cvTextIsHex = isHexColor(globalCvTextColor);
  const cvBgStyle = cvBgIsHex ? { backgroundColor: globalCvBgColor } : {};
  let cvTextStyle = cvTextIsHex ? { color: globalCvTextColor } : {};
  
  const defaultCvButtonBgClass = 'bg-slate-600 hover:bg-slate-500';
  let defaultCvButtonTextColorClass = 'text-slate-200';
  let finalCvBgClass = !cvBgIsHex ? (globalCvBgColor || defaultCvButtonBgClass) : '';
  let finalCvTextClass = !cvTextIsHex ? (globalCvTextColor || '') : '';

  if (cvBgIsHex && (!globalCvTextColor || !isHexColor(globalCvTextColor))) {
    cvTextStyle = { color: getContrastingTextColor(globalCvBgColor) };
    finalCvTextClass = '';
  } else if (!globalCvTextColor && !cvTextIsHex && !cvName) {
    finalCvTextClass = defaultCvButtonTextColorClass;
  } else if (!globalCvTextColor && !cvTextIsHex && cvName && !cvStyles[cvName]){
     finalCvTextClass = defaultCvButtonTextColorClass;
  }
  const cvButtonText = cvName ? cvName : '未分配CV';

  const canBatchReassign = !!project && !!character && character.projectId === project.id;
  const isUnknownRole = character.name === '待识别角色';

  const handleBatchReassign = (args: {
    targetCharacterId: string;
    rangeStartChapterNumber: number;
    rangeEndChapterNumber: number;
    includeUnassigned: boolean;
  }) => {
    if (!project || !character) return;
    const { targetCharacterId, rangeStartChapterNumber, rangeEndChapterNumber, includeUnassigned } = args;

    undoableProjectUpdate((prev) => {
      const startIdx = Math.max(0, rangeStartChapterNumber - 1);
      const endIdx = Math.min(prev.chapters.length - 1, rangeEndChapterNumber - 1);

      let changed = 0;
      const nextChapters = prev.chapters.map((ch, idx) => {
        if (idx < startIdx || idx > endIdx) return ch;
        const nextLines = ch.scriptLines.map((line) => {
          const shouldReplace =
            line.characterId === character.id || (includeUnassigned && !line.characterId);
          if (!shouldReplace) return line;
          if (line.characterId === targetCharacterId) return line;
          changed++;
          return { ...line, characterId: targetCharacterId };
        });
        return { ...ch, scriptLines: nextLines };
      });

      if (changed === 0) return prev;
      return { ...prev, chapters: nextChapters, lastModified: Date.now() };
    });

    setIsBatchReassignOpen(false);
  };

  const handleFixUnassigned = (args: { rangeStartChapterNumber: number; rangeEndChapterNumber: number }) => {
    if (!project || !character) return;

    const { rangeStartChapterNumber, rangeEndChapterNumber } = args;
    const unknownId = character.id;

    undoableProjectUpdate((prev) => {
      const startIdx = Math.max(0, rangeStartChapterNumber - 1);
      const endIdx = Math.min(prev.chapters.length - 1, rangeEndChapterNumber - 1);

      const validIds = new Set<string>();
      contextCharacters.forEach((c) => {
        if (c.status === 'merged') return;
        if (!c.projectId || c.projectId === prev.id) validIds.add(c.id);
      });
      validIds.add(unknownId);

      let changed = 0;
      const nextChapters = prev.chapters.map((ch, idx) => {
        if (idx < startIdx || idx > endIdx) return ch;
        const nextLines = ch.scriptLines.map((line) => {
          const cid = line.characterId || '';
          const isBad = !cid || !validIds.has(cid);
          if (!isBad) return line;
          if (cid === unknownId) return line;
          changed++;
          return { ...line, characterId: unknownId };
        });
        return { ...ch, scriptLines: nextLines };
      });

      if (changed === 0) return prev;
      return { ...prev, chapters: nextChapters, lastModified: Date.now() };
    });

    setIsFixUnassignedOpen(false);
  };


  return (
    <div className={`fixed top-0 right-0 h-full w-96 bg-slate-850 shadow-2xl text-slate-200
                     transform transition-transform duration-300 ease-in-out z-40 border-l border-slate-700
                     ${character ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="flex justify-between items-center p-5 border-b border-slate-700">
        <h2 className="text-xl font-semibold text-sky-400 truncate" title={character.name}>
          角色: {character.name}
        </h2>
        <button 
          onClick={onClose} 
          className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-full text-sky-300 hover:text-sky-100 transition-colors"
          aria-label="关闭角色详情"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="bg-slate-800 p-5 h-[calc(100%-73px)] overflow-y-auto space-y-5">
        
        <section>
          <div className="flex justify-between items-center mb-2.5">
            <h3 className="text-lg font-medium text-slate-300">基本信息</h3>
            <button 
              onClick={() => onEditCharacter(character)} // Opens unified modal
              className="flex items-center text-xs px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-md"
            >
              <PencilIcon className="w-3 h-3 mr-1" /> 编辑角色/CV
            </button>
          </div>
          <div className="space-y-2 text-sm">
            <p><strong className="text-slate-400">名称:</strong> <span className="text-slate-100">{character.name}</span></p>
            <p><strong className="text-slate-400">描述:</strong> <span className="text-slate-100">{character.description || '无描述'}</span></p>
            <div className="flex items-center">
              <strong className="text-slate-400">角色样式:</strong>
              <span 
                className={`ml-2 px-3 py-1 rounded text-xs ${charBgClass} ${charTextClass}`} 
                style={{...charBgStyle, ...charTextStyle}}
              >
                Aa
              </span>
              <span className="ml-2 text-xs text-slate-500">({character.color}, {character.textColor || '自动'})</span>
               {character.isStyleLockedToCv && <span className="ml-2 text-xs text-amber-400">(独立样式)</span>}
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-medium text-slate-300 mb-2.5">角色描述</h3>
          {profileRows.length > 0 ? (
            <div className="space-y-2 text-sm">
              {profileRows.map(([label, value]) => (
                <p key={label}>
                  <strong className="text-slate-400">{label}:</strong>{' '}
                  <span className="text-slate-100 whitespace-pre-wrap">{value}</span>
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">暂无 AI 角色描述，可在角色列表点击闪光按钮生成。</p>
          )}
        </section>

        <section>
          <div className="flex justify-between items-center mb-2.5">
            <h3 className="text-lg font-medium text-slate-300">配音 (CV)</h3>
            <button 
              onClick={() => onEditCv(character)} // Also opens unified modal
              className="flex items-center text-xs px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-md"
            >
              <UserCircleIcon className="w-3 h-3 mr-1" /> 编辑角色/CV
            </button>
          </div>
          <div className="space-y-2 text-sm">
            <p><strong className="text-slate-400">CV名称:</strong> <span className="text-slate-100">{cvButtonText}</span></p>
            {cvName && (
              <div className="flex items-center">
                <strong className="text-slate-400">CV全局样式:</strong>
                <span 
                  className={`ml-2 px-3 py-1 rounded text-xs ${finalCvBgClass} ${finalCvTextClass}`}
                  style={{...cvBgStyle, ...cvTextStyle}}
                >
                  Aa
                </span>
                 <span className="ml-2 text-xs text-slate-500">({globalCvBgColor || 'N/A'}, {globalCvTextColor || '自动'})</span>
              </div>
            )}
             {!character.isStyleLockedToCv && cvName && (
                <p className="text-xs text-sky-300">角色样式当前跟随此CV的全局样式。</p>
            )}
          </div>
        </section>

        <section>
          <h3 className="text-lg font-medium text-slate-300 mb-2.5">章节出场</h3>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setIsBatchReassignOpen(true)}
              disabled={!canBatchReassign}
              className="px-3 py-2 text-sm bg-sky-700 hover:bg-sky-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md"
              title={
                canBatchReassign
                  ? '按章节范围批量把该角色替换为其他角色'
                  : '仅支持对“项目内角色”批量替换（不是全局模板角色）'
              }
            >
              批量替换角色…
            </button>
            {isUnknownRole && (
              <button
                onClick={() => setIsFixUnassignedOpen(true)}
                className="px-3 py-2 text-sm bg-teal-700 hover:bg-teal-800 text-white rounded-md"
                title="将未分配/无效角色的行统一修复为“待识别角色”"
              >
                修复未分配…
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {characterAppearances.length > 0 ? (
              <ul className="space-y-1.5">
                {characterAppearances.map(appearance => (
                  <li key={appearance.chapterId}>
                    <button
                      onClick={() => onSelectChapter(appearance.chapterId)}
                      className="w-full text-left flex items-center justify-between p-2.5 bg-slate-700 hover:bg-sky-600/70 rounded-md transition-colors duration-150 group"
                    >
                      <div className="flex items-center min-w-0">
                        <BookOpenIcon className="w-4 h-4 mr-2 text-sky-400 group-hover:text-sky-200 flex-shrink-0" />
                        <span className="text-sm text-slate-200 group-hover:text-white truncate" title={appearance.chapterTitle}>
                          {appearance.chapterTitle}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 group-hover:text-sky-200 flex-shrink-0 ml-2">
                        {appearance.lineCount} 行
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400 text-center py-3">该角色尚未在任何章节中出现。</p>
            )}
          </div>
        </section>
      </div>

      {project && isBatchReassignOpen && (
        <BatchReassignCharacterModal
          isOpen={isBatchReassignOpen}
          onClose={() => setIsBatchReassignOpen(false)}
          project={project}
          sourceCharacter={character}
          characters={contextCharacters}
          onConfirm={handleBatchReassign}
        />
      )}

      {project && isUnknownRole && isFixUnassignedOpen && (
        <FixUnassignedToUnknownModal
          isOpen={isFixUnassignedOpen}
          onClose={() => setIsFixUnassignedOpen(false)}
          project={project}
          unknownRoleName={character.name}
          isLineUnassignedOrInvalid={isLineUnassignedOrInvalid}
          onConfirm={handleFixUnassigned}
        />
      )}
    </div>
  );
};

export default CharacterDetailsSidePanel;
