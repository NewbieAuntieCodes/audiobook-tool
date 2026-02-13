import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SoundLibraryItem } from '../../../types';
import { PlayIcon, PauseIcon, BookmarkIcon } from '../../../components/ui/icons';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import { soundLibraryRepository } from '../../../repositories/soundLibraryRepository';
import { getNearestFolderNameFromSoundName, getSoundFileNameFromSoundName } from '../../../lib/soundPath';

interface BgmPopoverProps {
    keyword: string;
    top: number;
    left: number;
    onClose: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    soundLibrary: SoundLibraryItem[];
    pinnedSoundId?: number | null;
    onPinSound?: (soundId: number | null, soundName: string | null) => void;
}

const formatDuration = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
};

const BgmPopover: React.FC<BgmPopoverProps> = ({ keyword, top, left, onClose, onMouseEnter, onMouseLeave, soundLibrary, pinnedSoundId, onPinSound }) => {
    const [playingSoundId, setPlayingSoundId] = useState<number | null>(null);
    const [loadingSoundId, setLoadingSoundId] = useState<number | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    const matchingSounds = useMemo(() => {
        const lowerKeyword = keyword.toLowerCase();
        return soundLibrary
            .filter((sound) => {
                const cat = (sound.category || '').toLowerCase();
                const isMusicLike = cat.startsWith('music') || cat.startsWith('ambience');
                return isMusicLike && sound.name.toLowerCase().includes(lowerKeyword);
            })
            .slice(0, 10); // Limit to 10 results
    }, [keyword, soundLibrary]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        
        const handleEnded = () => setPlayingSoundId(null);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('pause', handleEnded);
        
        return () => {
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('pause', handleEnded);
            audio.pause();
            if (audio.src) URL.revokeObjectURL(audio.src);
        };
    }, []);

    const handlePreview = async (sound: SoundLibraryItem) => {
        const audio = audioRef.current;
        if (!audio || !sound.id) return;

        if (playingSoundId === sound.id) {
            audio.pause();
            setPlayingSoundId(null);
            return;
        }

        if (audio.src) {
            URL.revokeObjectURL(audio.src);
        }

        setLoadingSoundId(sound.id);
        try {
            const file = await soundLibraryRepository.getSoundFile(sound, { requestPermission: true, allowRootResolve: true });
            const url = URL.createObjectURL(file);
            audio.src = url;
            await audio.play();
            setPlayingSoundId(sound.id);
        } catch (e) {
            console.error("Error previewing sound:", e);
            const name = e instanceof Error ? e.name : '';
            if (name === 'NotAllowedError' || name === 'SecurityError') {
                alert('需要授权读取音乐文件/文件夹权限，才能预览。');
            } else if (name === 'NotFoundError') {
                alert('找不到该音乐文件，可能已被移动/删除。请在音效库里点击“更新”重新扫描。');
            } else {
                alert('无法预览该音乐。');
            }
        } finally {
            setLoadingSoundId(null);
        }
    };
    
    // Position adjustment logic
    const [position, setPosition] = useState({ top, left });
    useEffect(() => {
        if (popoverRef.current) {
            const rect = popoverRef.current.getBoundingClientRect();
            let newLeft = left;
            if (newLeft + rect.width > window.innerWidth) {
                newLeft = window.innerWidth - rect.width - 10;
            }
            setPosition({ top: top + 10, left: newLeft });
        }
    }, [top, left]);

    return (
        <div
            ref={popoverRef}
            className="fixed z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-3 w-80 max-h-80 flex flex-col"
            style={{ top: position.top, left: position.left }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <audio ref={audioRef} />
            <h4 className="text-sm font-semibold text-sky-300 mb-2 border-b border-slate-700 pb-2">
                音乐库匹配: <span className="text-white">{keyword}</span>
            </h4>
            {matchingSounds.length === 0 ? (
                <div className="flex-grow flex items-center justify-center text-sm text-slate-400">
                    无匹配音乐
                </div>
            ) : (
                <ul className="space-y-1 overflow-y-auto">
                    {matchingSounds.map(sound => {
                        const fileName = getSoundFileNameFromSoundName(sound.name) ?? sound.name;
                        const folderName = getNearestFolderNameFromSoundName(sound.name);
                        const displayName = folderName ? `${fileName} / ${folderName}` : fileName;

                        return (
                            <li key={sound.id} className="group flex items-center justify-between p-1.5 rounded-md hover:bg-slate-700">
                                <div className="flex items-center min-w-0">
                                    <span className="text-sm truncate" title={sound.name}>{displayName}</span>
                                </div>
                                <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                                    <span className="text-xs text-slate-400 font-mono">{formatDuration(sound.duration)}</span>
                                    <button onClick={() => handlePreview(sound)} className="p-1.5 rounded-full bg-slate-600 hover:bg-sky-600 text-white">
                                        {loadingSoundId === sound.id ? <LoadingSpinner /> : (playingSoundId === sound.id ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />)}
                                    </button>
                                    {onPinSound && sound.id && (
                                        <button
                                            onClick={() => onPinSound(pinnedSoundId === sound.id ? null : sound.id!, pinnedSoundId === sound.id ? null : sound.name)}
                                            className="p-1.5 rounded-full text-slate-400 hover:text-amber-400"
                                            title={pinnedSoundId === sound.id ? "取消钉住" : "钉住此音乐"}
                                        >
                                            <BookmarkIcon className={`w-4 h-4 ${pinnedSoundId === sound.id ? 'text-amber-400 fill-current' : ''}`} />
                                        </button>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default BgmPopover;
