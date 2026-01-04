import React from 'react';
import { ScriptLine, Chapter, Character } from '../../../types';
import AudioScriptLine from './AudioScriptLine';
import { BookOpenIcon } from '../../../components/ui/icons';

interface ScriptLineListProps {
  selectedChapter: Chapter | undefined;
  selectedChapterIndex: number;
  visibleScriptLines: ScriptLine[];
  characters: Character[];
  isRecordingMode: boolean;
  cvFilter: string;
  characterFilter: string;
  activeRecordingLineId: string | null;
  setActiveRecordingLineId: (id: string | null) => void;
  openWaveformEditor: (lineId: string, lineIndex: number, sourceAudioId: string, sourceAudioFilename: string) => void;
  lineRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  projectId: string;
}

const formatChapterNumber = (index: number) => {
    if (index < 0) return '';
    const number = index + 1;
    return number < 1000 ? String(number).padStart(3, '0') : String(number);
};

const ScriptLineList: React.FC<ScriptLineListProps> = ({
  selectedChapter,
  selectedChapterIndex,
  visibleScriptLines,
  characters,
  isRecordingMode,
  cvFilter,
  characterFilter,
  activeRecordingLineId,
  setActiveRecordingLineId,
  openWaveformEditor,
  lineRefs,
  projectId,
}) => {
  if (!selectedChapter) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
        <BookOpenIcon className="w-16 h-16 mb-4"/>
        <p className="text-lg">请从左侧选择一个章节开始对轨。</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-xl font-bold text-sky-300 mb-4">{`${formatChapterNumber(selectedChapterIndex!)} ${selectedChapter.title}`}</h3>
      <div className="space-y-3">
        {visibleScriptLines.map((line, index) => {
            let isDimmed = false;
            if (isRecordingMode) {
                const lineCharacter = characters.find(c => c.id === line.characterId);
                const cvFilterActive = !!cvFilter;
                const charFilterActive = !!characterFilter;
                
                if (cvFilterActive || charFilterActive) {
                    isDimmed = true; // Assume dimmed unless it matches
                    if (lineCharacter) {
                        const cvMatch = !cvFilterActive || (lineCharacter.cvName === cvFilter);
                        const charMatch = !charFilterActive || (lineCharacter.id === characterFilter);
                        if (cvMatch && charMatch) {
                            isDimmed = false;
                        }
                    }
                }
            }
            return (
            <div key={line.id} ref={el => { if (el) lineRefs.current.set(line.id, el); else lineRefs.current.delete(line.id); }}>
                <AudioScriptLine
                    line={line}
                    index={index}
                    nextLine={visibleScriptLines[index+1]}
                    chapterId={selectedChapter.id}
                    projectId={projectId}
                    character={characters.find(c => c.id === line.characterId)}
                    onRequestCalibration={openWaveformEditor}
                    isDimmed={isDimmed}
                    isRecordingActive={isRecordingMode && line.id === activeRecordingLineId}
                    onLineClick={() => isRecordingMode && setActiveRecordingLineId(line.id)}
                />
            </div>
        )})}
      </div>
    </div>
  );
};

export default ScriptLineList;
