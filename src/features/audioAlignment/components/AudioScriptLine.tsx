import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ScriptLine, Character, LineType, SilencePairing, PronunciationNote } from '../../../types';
import { useStore } from '../../../store/useStore';
import { db } from '../../../db';
import { isHexColor, getContrastingTextColor } from '../../../lib/colorUtils';
import { stripPostProductionMarkers, escapeHtml } from '../../../lib/postProductionTextUtils';
import { tokenizeWithPronunciation } from '../../../lib/pronunciation';
// FIX: Import `UploadIcon` to resolve the "Cannot find name 'UploadIcon'" error.
import { TrashIcon, PlayIcon, PauseIcon, CheckCircleIcon, XMarkIcon, ReturnIcon, ArrowPathIcon, AdjustmentsVerticalIcon, UploadIcon, SpeakerXMarkIcon } from '../../../components/ui/icons';
import NumberInput from '../../../components/ui/NumberInput';

interface AudioScriptLineProps {
    line: ScriptLine;
    index: number;
    nextLine?: ScriptLine;
    character: Character | undefined;
    projectId: string;
    chapterId: string;
    pronunciationNotes: PronunciationNote[];
    onRequestCalibration: (lineId: string, lineIndex: number, sourceAudioId: string, sourceAudioFilename: string) => void;
    isDimmed: boolean;
    isRecordingActive: boolean;
    onLineClick: () => void;
}

const NON_AUDIO_ROLE_NAMES = new Set(['[静音]', '静音', '音效', '[音效]', 'sfx']);

const getLineType = (line: ScriptLine | undefined, characters: Character[]): LineType => {
    if (!line || !line.characterId) return 'narration';
    const character = characters.find(c => c.id === line.characterId);
    if (!character || character.name === 'Narrator' || character.name === '[静音]') return 'narration';
    if (character.name === '音效' || character.name === '[音效]') return 'sfx';
    return 'dialogue';
};

const SilenceEditor: React.FC<{
    line: ScriptLine,
    nextLine?: ScriptLine,
}> = ({ line, nextLine }) => {
    const { projects, characters, updateLinePostSilence, selectedProjectId, selectedChapterId } = useStore();
    const [isEditing, setIsEditing] = useState(false);
    const [editingValue, setEditingValue] = useState(0);

    const project = projects.find(p => p.id === selectedProjectId);
    const silenceSettings = project?.silenceSettings;

    const effectiveSilence = useMemo(() => {
        if (line.postSilence !== undefined && line.postSilence !== null) {
            return line.postSilence;
        }
        if (!silenceSettings) return 1.0;
        if (!nextLine) return silenceSettings.endPadding;

        const currentType = getLineType(line, characters);
        const nextType = getLineType(nextLine, characters);
        const pairKey = `${currentType}-to-${nextType}` as SilencePairing;
        return silenceSettings.pairs[pairKey] ?? 1.0;
    }, [line, nextLine, characters, silenceSettings]);

    const handleSave = () => {
        if (selectedProjectId && selectedChapterId) {
            updateLinePostSilence(selectedProjectId, selectedChapterId, line.id, editingValue);
        }
        setIsEditing(false);
    };
    
    const handleReset = () => {
        if (selectedProjectId && selectedChapterId) {
            updateLinePostSilence(selectedProjectId, selectedChapterId, line.id, undefined);
        }
        setIsEditing(false);
    }
    
    if (isEditing) {
        return (
            <div className="flex items-center gap-x-1" onBlur={handleSave}>
                <NumberInput 
                    value={editingValue} 
                    onChange={setEditingValue} 
                    step={0.1}
                    min={0}
                    precision={1}
                />
                 <span className="text-xs text-slate-400">s</span>
                 <button onClick={handleReset} className="p-1 text-slate-400 hover:text-sky-300" title="恢复默认值">
                    <ArrowPathIcon className="w-4 h-4" />
                 </button>
            </div>
        );
    }

    const isOverridden = line.postSilence !== undefined && line.postSilence !== null;

    return (
        <button 
            onClick={() => {
                setEditingValue(effectiveSilence);
                setIsEditing(true);
            }}
            className={`px-2 py-1 rounded-md text-sm transition-colors ${isOverridden ? 'bg-sky-800 text-sky-200 font-semibold' : 'bg-slate-800/50 text-slate-400'}`}
            title={isOverridden ? "自定义间隔 (点击编辑)" : "默认间隔 (点击编辑)"}
        >
            {effectiveSilence.toFixed(1)}s
        </button>
    );
}


const AudioScriptLine: React.FC<AudioScriptLineProps> = ({ line, index, nextLine, character, projectId, chapterId, pronunciationNotes, onRequestCalibration, isDimmed, isRecordingActive, onLineClick }) => {
    const { 
        assignAudioToLine, 
        updateLineAudio, 
        projects, 
        playingLineInfo, 
        setPlayingLine, 
        clearPlayingLine,
        fillAudioGapFromNext,
        toggleLineReturnMark,
        updateLineFeedback,
    } = useStore(state => ({
        assignAudioToLine: state.assignAudioToLine,
        updateLineAudio: state.updateLineAudio,
        projects: state.projects,
        playingLineInfo: state.playingLineInfo,
        setPlayingLine: state.setPlayingLine,
        clearPlayingLine: state.clearPlayingLine,
        fillAudioGapFromNext: state.fillAudioGapFromNext,
        toggleLineReturnMark: state.toggleLineReturnMark,
        updateLineFeedback: state.updateLineFeedback,
    }));
    const [audioInfo, setAudioInfo] = useState<{ hasAudio: boolean; sourceAudioId?: string; sourceAudioFilename?: string }>({ hasAudio: false });
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    const cvStyles = React.useMemo(() => {
        const currentProject = projects.find(p => p.id === projectId);
        return currentProject?.cvStyles || {};
    }, [projects, projectId]);
    
    useEffect(() => {
        if (line.audioBlobId) {
            db.audioBlobs.get(line.audioBlobId).then(blobData => {
                if (blobData) {
                    setAudioInfo({ 
                        hasAudio: true, 
                        sourceAudioId: blobData.sourceAudioId, 
                        sourceAudioFilename: blobData.sourceAudioFilename 
                    });
                } else {
                    setAudioInfo({ hasAudio: false });
                }
            });
        } else {
            setAudioInfo({ hasAudio: false });
        }
    }, [line.audioBlobId]);

    const handleDeleteAudio = async () => {
        if (line.audioBlobId) {
            if (playingLineInfo?.line.id === line.id) {
                clearPlayingLine();
            }
            const blobIdToDelete = line.audioBlobId;
            await updateLineAudio(projectId, chapterId, line.id, null);
            await db.audioBlobs.delete(blobIdToDelete);
        }
    };
    
    const isPlaying = playingLineInfo?.line.id === line.id;

    const handlePlayPauseClick = () => {
        if (isPlaying) {
            clearPlayingLine();
        } else if (audioInfo.hasAudio) {
            setPlayingLine(line, character);
        }
    };

    // --- Drag and Drop Handlers ---
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) {
            setIsDraggingOver(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
    };

    const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);

        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('audio/')) {
            await assignAudioToLine(projectId, chapterId, line.id, file);
        } else {
            alert('请拖拽有效的音频文件 (如 .wav, .mp3)。');
        }
    }, [assignAudioToLine, projectId, chapterId, line.id]);
    // --- End Drag and Drop Handlers ---

    const handleFeedbackBlur = (e: React.FocusEvent<HTMLDivElement>) => {
        const newFeedback = e.currentTarget.innerText;
        if (newFeedback !== (line.feedback || '')) {
            updateLineFeedback(projectId, chapterId, line.id, newFeedback);
        }
    };

    const isNarration = !character || character.name.toLowerCase() === 'narrator';
    const isNonAudioRole = !!character?.name && NON_AUDIO_ROLE_NAMES.has(character.name);
    
    const rowBgClass = !isNarration && character && !isHexColor(character.color) ? character.color : 'bg-slate-700';
    const rowBgStyle = !isNarration && character && isHexColor(character.color) ? { backgroundColor: character.color } : {};
    
    const getRowTextStyle = () => {
        if (isNarration || !character) {
            return { style: {}, className: 'text-slate-100' };
        }
        
        const rowBgIsHex = isHexColor(character.color);
        const charTextIsHex = isHexColor(character.textColor || '');

        let style: React.CSSProperties = {};
        let className = '';

        if (charTextIsHex) {
            style.color = character.textColor;
        } else {
            className += ` ${character.textColor || ''}`;
        }

        if (!character.textColor) {
            if (rowBgIsHex) {
                style.color = getContrastingTextColor(character.color);
            } else {
                const darkBgPatterns = ['-700', '-800', '-900', 'slate-600', 'gray-600', 'zinc-600', 'stone-600'];
                const isDarkBg = character.color && darkBgPatterns.some(pattern => character.color.includes(pattern));
                className += isDarkBg ? ' text-slate-100' : ' text-slate-800';
            }
        }
        return { style, className };
    };
    const rowTextStyle = getRowTextStyle();

    const cleanedLineHtml = useMemo(() => {
        const stripped = stripPostProductionMarkers(line.text);
        const escapeWithNewlines = (raw: string) => escapeHtml(raw).replace(/\r?\n/g, '<br>');

        if (!pronunciationNotes || pronunciationNotes.length === 0) {
            return escapeWithNewlines(stripped);
        }

        const tokens = tokenizeWithPronunciation(stripped, pronunciationNotes);
        return tokens
            .map((t) => {
                if (t.type === 'text') return escapeWithNewlines(t.value);

                const term = escapeHtml(t.term);
                const pinyin = escapeHtml(t.pinyin);
                const titleAttr = t.note ? ` title="${escapeHtml(t.note)}"` : '';
                return `<ruby class="pronunciation-ruby"${titleAttr}>${term}<rt>${pinyin}</rt></ruby>`;
            })
            .join('');
    }, [line.text, pronunciationNotes]);
    
    const getCvChipStyle = () => {
        if (!character?.cvName) {
            return { style: {}, className: '' };
        }
        const cvName = character.cvName;
        const cvStyle = cvStyles[cvName];
        let cvBgToUse = cvStyle?.bgColor || 'bg-slate-600';
        let cvTextToUse = cvStyle?.textColor || 'text-slate-200';
        
        const bgIsHex = isHexColor(cvBgToUse);
        const textIsHex = isHexColor(cvTextToUse);
        let style: React.CSSProperties = {};
        let className = 'px-2 py-1 rounded text-xs font-medium';
        if (bgIsHex) {
            style.backgroundColor = cvBgToUse;
        } else {
            className += ` ${cvBgToUse}`;
        }
        if (textIsHex) {
            style.color = cvTextToUse;
        } else {
            className += ` ${cvTextToUse}`;
        }
        if (!cvStyle?.textColor && !textIsHex) {
             if (bgIsHex) {
                 style.color = getContrastingTextColor(cvBgToUse);
             }
        }
        return { style, className };
    };
    const cvChipStyle = getCvChipStyle();
    
    const playingClass = isPlaying ? 'outline outline-4 outline-amber-400 shadow-[0_0_25px_15px_rgba(250,204,21,0.5)]' : 'border-slate-700';
    const recordingActiveClass = isRecordingActive ? 'ring-2 ring-green-500' : '';
    const dragDropClasses = isDraggingOver ? 'border-sky-500 border-dashed bg-slate-600/50' : playingClass;

    return (
        <div 
            className={`relative transition-opacity duration-300 ${isDimmed ? 'opacity-25' : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={onLineClick}
        >
            <div className="flex items-center gap-x-2">
                <div className={`p-3 rounded-lg border flex-grow flex items-center gap-x-2 transition-all duration-200 ${dragDropClasses} ${rowBgClass} ${recordingActiveClass}`} style={rowBgStyle}>
                    <div className="w-20 flex-shrink-0 flex items-center justify-start">
                        {!isNarration && character && (
                            character.cvName ? (
                                <span 
                                    className={`truncate ${cvChipStyle.className}`}
                                    style={cvChipStyle.style}
                                    title={character.cvName}
                                >
                                    {character.cvName}
                                </span>
                            ) : (
                                 <span className="text-xs text-slate-400 px-2">无CV</span>
                            )
                        )}
                    </div>
                    
                    <div 
                        className={`w-24 flex-shrink-0 text-sm truncate font-semibold ${rowTextStyle.className}`}
                        style={rowTextStyle.style}
                        title={character?.name || '旁白'}
                    >
                        {character?.name || '旁白'}
                    </div>

                    <div
                        className={`flex-grow ${rowTextStyle.className}`}
                        style={rowTextStyle.style}
                        dangerouslySetInnerHTML={{ __html: cleanedLineHtml }}
                    >
                    </div>
                    <div className="flex-shrink-0 flex items-center space-x-2 z-10">
                        <button
                            onClick={handlePlayPauseClick}
                            disabled={!audioInfo.hasAudio}
                            className="p-2 rounded-full bg-slate-600 hover:bg-sky-500 text-slate-200 hover:text-white transition-colors disabled:opacity-50"
                            title={isPlaying ? "暂停" : "播放"}
                        >
                            {isPlaying ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
                        </button>
                        
                        <button
                           onClick={() => audioInfo.sourceAudioId && audioInfo.sourceAudioFilename && onRequestCalibration(line.id, index, audioInfo.sourceAudioId, audioInfo.sourceAudioFilename)}
                           disabled={!audioInfo.sourceAudioId}
                           className="p-2 rounded-full bg-slate-600 hover:bg-teal-500 text-slate-200 hover:text-white transition-colors disabled:opacity-50"
                           title="校准音频标记"
                        >
                            <AdjustmentsVerticalIcon className="w-4 h-4" />
                        </button>

                        <button
                            onClick={handleDeleteAudio}
                            disabled={!line.audioBlobId}
                            className="p-2 rounded-full bg-slate-600 hover:bg-red-500 text-slate-200 hover:text-white transition-colors disabled:opacity-50"
                            title="删除音频"
                        >
                            <TrashIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                <div className="flex-shrink-0 flex items-center justify-end gap-x-2">
                  {audioInfo.hasAudio ? (
                      <span title="已有音频">
                        <CheckCircleIcon className="w-5 h-5 text-green-500" />
                      </span>
                  ) : isNonAudioRole ? (
                      <span title="该句为静音/音效，无需配音">
                        <SpeakerXMarkIcon className="w-5 h-5 text-slate-400" />
                      </span>
                  ) : (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await fillAudioGapFromNext(projectId, chapterId, line.id);
                        }}
                        disabled={isRecordingActive}
                        className="p-1 rounded hover:bg-slate-700/50 disabled:opacity-50"
                        title="缺音：点击补位并顺延对轨"
                      >
                        <XMarkIcon className="w-5 h-5 text-red-500" />
                      </button>
                  )}
                   <button
                        onClick={() => toggleLineReturnMark(projectId, chapterId, line.id)}
                        title={line.isMarkedForReturn ? "取消返工标记" : "标记为返工"}
                        className={`transition-colors p-1 rounded-full ${line.isMarkedForReturn ? 'text-red-500 hover:text-red-400' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      <ReturnIcon className="w-5 h-5" />
                   </button>
                   <SilenceEditor line={line} nextLine={nextLine} />
                </div>
                <div className="flex-shrink-0 w-16 flex items-center justify-center">
                    {line.soundType && (
                    <span 
                        className="px-2 py-1 rounded-md text-xs font-semibold bg-indigo-800 text-indigo-200"
                        title={`声场: ${line.soundType}`}
                    >
                        {line.soundType}
                    </span>
                   )}
                </div>
            </div>
            <div 
                className={`transition-all duration-300 ease-in-out overflow-hidden ${line.isMarkedForReturn ? 'max-h-40 mt-1.5' : 'max-h-0'}`}
            >
                {line.isMarkedForReturn && (
                    <div className="pl-[12.75rem] pr-[13rem]">
                         <div className="bg-slate-800/70 border border-dashed border-red-500/50 rounded-md p-2">
                            {/* FIX: Replaced the invalid 'placeholder' attribute on a content-editable div with a 'data-placeholder' attribute and Tailwind CSS utilities. The 'empty:before:' pseudo-class is used to display the placeholder text when the div is empty, fixing the TypeScript error while preserving functionality. */}
                            <div
                                contentEditable
                                suppressContentEditableWarning
                                onBlur={handleFeedbackBlur}
                                className="w-full text-sm text-red-300 outline-none focus:ring-0 whitespace-pre-wrap min-h-[24px] empty:before:content-[attr(data-placeholder)] empty:before:text-red-300/50"
                                data-placeholder="在此处输入反馈意见..."
                                dangerouslySetInnerHTML={{ __html: line.feedback || '' }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {isDraggingOver && (
                <div className="absolute inset-0 bg-sky-500/20 rounded-lg flex items-center justify-center pointer-events-none border-2 border-dashed border-sky-300">
                    <UploadIcon className="w-8 h-8 text-sky-200" />
                    <span className="ml-3 text-lg font-semibold text-sky-100">拖拽音频到此处以上传</span>
                </div>
            )}
        </div>
    );
};

export default AudioScriptLine;
