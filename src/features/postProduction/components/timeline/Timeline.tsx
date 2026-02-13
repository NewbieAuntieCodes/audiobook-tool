import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useStore } from '../../../../store/useStore';
import { db } from '../../../../db';
import { LineType, ScriptLine, Character, SilencePairing, SoundLibraryItem, SoundGroup, TextMarker } from '../../../../types';
import LoadingSpinner from '../../../../components/ui/LoadingSpinner';
import TrackGroup from './TrackGroup';
import Track from '../Track';
import TimeRuler from './TimeRuler';
import { defaultSilenceSettings } from '../../../../lib/defaultSilenceSettings';
import Playhead from './Playhead';
import TimelineHeader from '../TimelineHeader';
import * as mm from 'music-metadata-browser';
import { soundLibraryRepository } from '../../../../repositories/soundLibraryRepository';
import { getNearestFolderNameFromSoundName, getSoundFileNameFromSoundName } from '../../../../lib/soundPath';

export interface TimelineClip {
    id: string;
    startTime: number;
    duration: number;
    line: ScriptLine; // For dialogue
    name?: string; // For SFX/BGM
    character?: Character;
    audioBlobId?: string; // For dialogue
    soundLibraryItem?: SoundLibraryItem; // For SFX/BGM
}

interface TrackData {
    name: string;
    type: 'narration' | 'dialogue' | 'os' | 'telephone' | 'system' | 'other' | 'music' | 'sfx' | 'ambience';
    clips: TimelineClip[];
}

interface TrackGroupData {
    name: string;
    isExpanded: boolean;
    tracks: TrackData[];
}

const getLineType = (line: ScriptLine | undefined, characters: Character[]): LineType => {
    if (!line || !line.characterId) return 'narration';
    const character = characters.find(c => c.id === line.characterId);
    if (!character || character.name === 'Narrator' || character.name === '[静音]') return 'narration';
    if (character.name === '音效' || character.name === '[音效]') return 'sfx';
    return 'dialogue';
};

const TRACK_HEADER_WIDTH_PX = 192; // Corresponds to w-48 (12rem)

const SOUND_CATEGORY_DISPLAY_NAMES: Record<string, string> = {
    music_1: '音乐1',
    music_2: '音乐2',
    sfx_1: '音效1',
    sfx_2: '音效2',
};

const getSoundTrackNameByFolder = (sound: SoundLibraryItem, fallback: string): string => {
    const folder = getNearestFolderNameFromSoundName(sound.name);
    if (folder) return folder;
    const category = (sound.category || '').trim();
    return SOUND_CATEGORY_DISPLAY_NAMES[category] || category || fallback;
};

const Timeline: React.FC = () => {
    const {
      selectedProjectId,
      selectedChapterId,
      projects,
      characters,
      soundLibrary,
      timelineIsPlaying,
      setTimelineIsPlaying,
      timelineCurrentTime,
      setTimelineCurrentTime,
      timelineZoom,
    } = useStore();
    
    const [trackGroups, setTrackGroups] = useState<TrackGroupData[]>([]);
    const [totalDuration, setTotalDuration] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [hasTimelineFocus, setHasTimelineFocus] = useState(false);
    
    const audioContextRef = useRef<AudioContext | null>(null);
    const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const scheduledClipsRef = useRef<Set<string>>(new Set());
    const schedulerTimerRef = useRef<number>();
    const animationFrameRef = useRef<number>();
    const playbackStartRef = useRef<{ contextTime: number, timelineTime: number } | null>(null);
    const calcRunIdRef = useRef(0);

    const BASE_PIXELS_PER_SECOND = 100;
    const pixelsPerSecond = BASE_PIXELS_PER_SECOND * timelineZoom;

    const currentProject = useMemo(() => projects.find(p => p.id === selectedProjectId), [projects, selectedProjectId]);
    const characterMap = useMemo<Map<string, Character>>(() => new Map(characters.map(c => [c.id, c])), [characters]);
    const soundLibraryMap = useMemo<Map<number, SoundLibraryItem>>(() => new Map(soundLibrary.filter(s => s.id !== undefined).map(s => [s.id!, s])), [soundLibrary]);
    const allClips = useMemo(() => trackGroups.flatMap(g => g.tracks.flatMap(t => t.clips)), [trackGroups]);

    const toggleTimelinePlayPause = useCallback(async () => {
        if (timelineIsPlaying) {
            setTimelineIsPlaying(false);
            return;
        }

        const ok = await soundLibraryRepository.requestRootReadPermission();
        if (!ok) {
            alert('需要授权读取音效库文件夹权限，才能播放包含音效的时间轴。');
            return;
        }

        setTimelineIsPlaying(true);
    }, [timelineIsPlaying, setTimelineIsPlaying]);

    useEffect(() => {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        return () => {
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().catch(console.error);
            }
        };
    }, []);

    const handleTimelineMouseDownCapture = useCallback(() => {
        setHasTimelineFocus(true);
    }, []);

    const handleSeek = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        const scrollContainer = event.currentTarget;
        const rect = scrollContainer.getBoundingClientRect();
        const clickX_in_viewport = event.clientX - rect.left;

        // Ignore clicks on the sticky header area
        if (clickX_in_viewport < TRACK_HEADER_WIDTH_PX) return;
        
        // Prevent seek when clicking on a clip (which stops propagation)
        // This check handles clicks on the empty track area.
        if ((event.target as HTMLElement).closest('[data-clip-id]')) return;

        const clickX_on_timeline = scrollContainer.scrollLeft + clickX_in_viewport - TRACK_HEADER_WIDTH_PX;
        const time = clickX_on_timeline / pixelsPerSecond;
        const newTime = Math.max(0, Math.min(time, totalDuration));
        
        setTimelineCurrentTime(newTime);
        
        if (timelineIsPlaying) {
            const audioContext = audioContextRef.current;
            if (!audioContext) return;
            
            activeSourcesRef.current.forEach(source => { try { source.stop(); } catch (e) {} });
            activeSourcesRef.current.clear();
            scheduledClipsRef.current.clear();
            playbackStartRef.current = { contextTime: audioContext.currentTime, timelineTime: newTime };
        }
    }, [pixelsPerSecond, totalDuration, setTimelineCurrentTime, timelineIsPlaying]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!hasTimelineFocus) return;

            if (!(event.code === 'Space' || event.key === ' ')) return;

            const target = event.target as HTMLElement | null;
            if (target) {
                const tagName = target.tagName;
                const isEditable =
                    tagName === 'INPUT' ||
                    tagName === 'TEXTAREA' ||
                    tagName === 'SELECT' ||
                    target.isContentEditable;
                if (isEditable) {
                    return;
                }
            }

            event.preventDefault();
            void toggleTimelinePlayPause();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [hasTimelineFocus, toggleTimelinePlayPause]);


    useEffect(() => {
        if (!currentProject) {
            setIsLoading(false);
            setTrackGroups([]);
            setTotalDuration(0);
            return;
        }

        const calculateTimeline = async () => {
            const runId = ++calcRunIdRef.current;
            setIsLoading(true);
            // FIX: The arguments for `setTimelineCurrentTime` and `setTimelineIsPlaying` were missing.
            setTimelineCurrentTime(0);
            setTimelineIsPlaying(false);

            let currentTime = 0;
            const silenceSettings = currentProject.silenceSettings || defaultSilenceSettings;
            currentTime += silenceSettings.startPadding > 0 ? silenceSettings.startPadding : 0;

            const chaptersForTimeline = selectedChapterId
                ? currentProject.chapters.filter(ch => ch.id === selectedChapterId)
                : currentProject.chapters;
            
            const allLinesWithAudio = chaptersForTimeline
                .flatMap(ch => ch.scriptLines)
                .filter(line => line.audioBlobId);
            
            const baseItemsUnsorted = (await Promise.all(
                allLinesWithAudio.map(async (line) => {
                    const audioBlobData = await db.audioBlobs.get(line.audioBlobId!);
                    if (audioBlobData) {
                        try {
                            const metadata = await mm.parseBlob(audioBlobData.data);
                            const duration = metadata.format.duration;
                            if (duration && duration > 0) {
                                return { line, duration };
                            }
                        } catch (e) {
                            console.error(`Failed to parse metadata for line ${line.id}:`, e);
                        }
                    }
                    return null;
                })
            )).filter((item): item is NonNullable<typeof item> => item !== null);

            // If a newer calculation started, ignore this run's results to avoid showing clips from a stale chapter selection.
            if (runId !== calcRunIdRef.current) return;

            const lineOrderMap = new Map<string, number>();
            chaptersForTimeline.forEach((ch, chIdx) => {
                ch.scriptLines.forEach((ln, lnIdx) => {
                    lineOrderMap.set(ln.id, chIdx * 100000 + lnIdx);
                });
            });
            baseItemsUnsorted.sort((a, b) => (lineOrderMap.get(a.line.id) ?? 0) - (lineOrderMap.get(b.line.id) ?? 0));
            
            const dialogueClips: TimelineClip[] = [];
            for (let i = 0; i < baseItemsUnsorted.length; i++) {
                const item = baseItemsUnsorted[i];
                dialogueClips.push({
                    id: item.line.id,
                    startTime: currentTime,
                    duration: item.duration,
                    line: item.line,
                    character: item.line.characterId ? characterMap.get(item.line.characterId) : undefined,
                    audioBlobId: item.line.audioBlobId!,
                });
                currentTime += item.duration;
                let silenceDuration = 0;
                if (item.line.postSilence !== undefined && item.line.postSilence !== null) {
                    silenceDuration = item.line.postSilence;
                } else {
                    if (i === baseItemsUnsorted.length - 1) {
                        silenceDuration = silenceSettings.endPadding;
                    } else {
                        const nextLine = baseItemsUnsorted[i+1].line;
                        const currentLineType = getLineType(item.line, characters);
                        const nextLineType = getLineType(nextLine, characters);
                        const pairKey = `${currentLineType}-to-${nextLineType}` as SilencePairing;
                        silenceDuration = silenceSettings.pairs[pairKey] ?? 1.0;
                    }
                }
                currentTime += silenceDuration > 0 ? silenceDuration : 0;
            }

            // --- Process Pinned Sounds ---
            const sfxClipsByTrack = new Map<string, TimelineClip[]>();
            const bgmClipsByTrack = new Map<string, TimelineClip[]>();
            const ambienceClipsByTrack = new Map<string, TimelineClip[]>();

            const pushClip = (map: Map<string, TimelineClip[]>, trackName: string, clip: TimelineClip) => {
                const list = map.get(trackName);
                if (list) list.push(clip);
                else map.set(trackName, [clip]);
            };

            for (const clip of dialogueClips) {
                if (clip.line.pinnedSounds) {
                    for (const pin of clip.line.pinnedSounds) {
                        const soundItem = soundLibraryMap.get(pin.soundId);
                        if (!soundItem) continue;

                        const isBgm = pin.keyword.startsWith('<') && pin.keyword.endsWith('>');
                        const lineTextLength = clip.line.text.length || 1;
                        const timeOffset = (pin.index / lineTextLength) * clip.duration;
                        const startTime = clip.startTime + timeOffset;
                        const fileName = getSoundFileNameFromSoundName(soundItem.name) ?? soundItem.name;
                        const folderName = getNearestFolderNameFromSoundName(soundItem.name);
                        const displayName = folderName ? `${fileName} / ${folderName}` : fileName;

                        const newClip: TimelineClip = {
                            id: `pin_${pin.soundId}_${pin.index}_${clip.id}`,
                            startTime,
                            duration: soundItem.duration,
                            name: displayName,
                            soundLibraryItem: soundItem,
                            line: clip.line, // for context
                        };

                        const category = (soundItem.category || '').toLowerCase();
                        const isAmbienceCategory = category.includes('ambience');

                        if (isAmbienceCategory) {
                            const trackName = getSoundTrackNameByFolder(soundItem, '环境音');
                            pushClip(ambienceClipsByTrack, trackName, newClip);
                        } else if (isBgm) {
                            const trackName = getSoundTrackNameByFolder(soundItem, '音乐');
                            pushClip(bgmClipsByTrack, trackName, newClip);
                        } else {
                            const trackName = getSoundTrackNameByFolder(soundItem, '音效');
                            pushClip(sfxClipsByTrack, trackName, newClip);
                        }
                    }
                }
            }

            // --- Process Sound Groups (短时事件包：一键插入多条音效) ---
            const groupById = new Map<string, SoundGroup>();
            (currentProject.soundGroups || []).forEach((g) => {
                if (g && g.id) groupById.set(g.id, g);
            });
            const soundByName = new Map<string, SoundLibraryItem>();
            (soundLibrary || []).forEach((s) => {
                if (s && typeof s.name === 'string') soundByName.set(s.name, s);
            });
            const dialogueClipByLineId = new Map<string, TimelineClip>();
            dialogueClips.forEach((c) => dialogueClipByLineId.set(c.line.id, c));

            const groupMarkers = (currentProject.textMarkers || []).filter(
                (m): m is TextMarker => m.type === 'sfxGroup' && !!m.groupId && !!m.startLineId,
            );

            for (const marker of groupMarkers) {
                const groupId = (marker.groupId || '').trim();
                if (!groupId) continue;
                const group = groupById.get(groupId);
                if (!group || !group.clips || group.clips.length === 0) continue;

                const anchorClip = dialogueClipByLineId.get(marker.startLineId);
                if (!anchorClip) continue;

                const textLen = anchorClip.line.text.length || 1;
                const rel = Math.max(0, Math.min(1, (marker.startOffset ?? 0) / textLen));
                const anchorTime = anchorClip.startTime + rel * anchorClip.duration;

                const groupLabel = (marker.name || group.name || '音效组').trim() || '音效组';

                for (let idx = 0; idx < group.clips.length; idx++) {
                    const gc = group.clips[idx];
                    const soundItem =
                        (typeof gc.soundId === 'number' ? soundLibraryMap.get(gc.soundId) : undefined) ||
                        (gc.soundName ? soundByName.get(gc.soundName) : undefined);
                    if (!soundItem) continue;

                    const startTime = Math.max(
                        0,
                        anchorTime + (Number.isFinite(gc.offsetSeconds) ? gc.offsetSeconds : 0),
                    );

                    const fileName = getSoundFileNameFromSoundName(soundItem.name) ?? soundItem.name;
                    const folderName = getNearestFolderNameFromSoundName(soundItem.name);
                    const displayName = folderName ? `${fileName} / ${folderName}` : fileName;

                    const newClip: TimelineClip = {
                        id: `sg_${marker.id}_${idx}_${soundItem.id ?? soundItem.name}`,
                        startTime,
                        duration: soundItem.duration,
                        name: `${groupLabel} - ${displayName}`,
                        soundLibraryItem: soundItem,
                        line: anchorClip.line, // for context
                    };

                    const category = (soundItem.category || '').toLowerCase();
                    const isAmbienceCategory = category.includes('ambience');
                    const isMusicCategory = category.startsWith('music');

                    if (isAmbienceCategory) {
                        const trackName = getSoundTrackNameByFolder(soundItem, '环境音');
                        pushClip(ambienceClipsByTrack, trackName, newClip);
                    } else if (isMusicCategory) {
                        const trackName = getSoundTrackNameByFolder(soundItem, '音乐');
                        pushClip(bgmClipsByTrack, trackName, newClip);
                    } else {
                        const trackName = getSoundTrackNameByFolder(soundItem, '音效');
                        pushClip(sfxClipsByTrack, trackName, newClip);
                    }
                }
            }

            let finalDuration = currentTime;
            const allPinnedClips = [
                ...Array.from(sfxClipsByTrack.values()).flat(),
                ...Array.from(bgmClipsByTrack.values()).flat(),
                ...Array.from(ambienceClipsByTrack.values()).flat(),
            ];
            allPinnedClips.forEach((clip) => {
                finalDuration = Math.max(finalDuration, clip.startTime + clip.duration);
            });

            // --- Build Track Groups ---
            const dialogueTracks: Record<string, TimelineClip[]> = { narration: [], dialogue: [], os: [], telephone: [], system: [], other: [] };
            const otherSoundTypes = new Set(currentProject.customSoundTypes || []);

            dialogueClips.forEach(clip => {
                const soundType = clip.line.soundType;
                if (clip.character?.name === 'Narrator') dialogueTracks.narration.push(clip);
                else if (soundType === 'OS') dialogueTracks.os.push(clip);
                else if (soundType === '电话音') dialogueTracks.telephone.push(clip);
                else if (soundType === '系统音') dialogueTracks.system.push(clip);
                else if (soundType && otherSoundTypes.has(soundType)) dialogueTracks.other.push(clip);
                else dialogueTracks.dialogue.push(clip);
            });
    
            const dialogueTrackData: TrackData[] = [
                { name: '旁白 (Narration)', type: 'narration', clips: dialogueTracks.narration },
                { name: '角色对白 (Dialogue)', type: 'dialogue', clips: dialogueTracks.dialogue },
                { name: '心音 (OS)', type: 'os', clips: dialogueTracks.os },
                { name: '电话音 (Telephone)', type: 'telephone', clips: dialogueTracks.telephone },
                { name: '系统音 (System)', type: 'system', clips: dialogueTracks.system },
                { name: '其他 (Others)', type: 'other', clips: dialogueTracks.other },
            ].filter(track => track.clips.length > 0);

            const newTrackGroups: TrackGroupData[] = [];

            if (dialogueTrackData.length > 0) {
                newTrackGroups.push({
                    name: '人声 (Dialogue)',
                    isExpanded: true,
                    tracks: dialogueTrackData
                });
            }

            const sortTrackNames = (a: string, b: string) =>
                a.localeCompare(b, 'zh-CN', { numeric: true, sensitivity: 'base' });

            const bgmTrackData: TrackData[] = Array.from(bgmClipsByTrack.entries())
                .filter(([, clips]) => clips.length > 0)
                .sort(([a], [b]) => sortTrackNames(a, b))
                .map(([name, clips]) => ({ name, type: 'music' as const, clips }));

            if (bgmTrackData.length > 0) {
                newTrackGroups.push({
                    name: '音乐 (Music)',
                    isExpanded: true,
                    tracks: bgmTrackData,
                });
            }

            const sfxTrackData: TrackData[] = Array.from(sfxClipsByTrack.entries())
                .filter(([, clips]) => clips.length > 0)
                .sort(([a], [b]) => sortTrackNames(a, b))
                .map(([name, clips]) => ({ name, type: 'sfx' as const, clips }));

            if (sfxTrackData.length > 0) {
                newTrackGroups.push({
                    name: '音效 (SFX)',
                    isExpanded: true,
                    tracks: sfxTrackData,
                });
            }
            
            scheduledClipsRef.current.clear();

            const finalTrackGroups: TrackGroupData[] = [...newTrackGroups];
            const ambienceTrackData: TrackData[] = Array.from(ambienceClipsByTrack.entries())
                .filter(([, clips]) => clips.length > 0)
                .sort(([a], [b]) => sortTrackNames(a, b))
                .map(([name, clips]) => ({ name, type: 'ambience' as const, clips }));

            if (ambienceTrackData.length > 0) {
                const ambienceGroup: TrackGroupData = {
                    name: '\u73af\u5883\u97f3 (Ambience)',
                    isExpanded: true,
                    tracks: ambienceTrackData,
                };
                const sfxIndex = finalTrackGroups.findIndex(g => g.name.includes('(SFX)'));
                if (sfxIndex >= 0) {
                    finalTrackGroups.splice(sfxIndex, 0, ambienceGroup);
                } else {
                    finalTrackGroups.push(ambienceGroup);
                }
            }

            const getGroupOrder = (name: string): number => {
                if (name.includes('(Dialogue)')) return 0;
                if (name.includes('(Ambience)')) return 1;
                if (name.includes('(SFX)')) return 2;
                if (name.includes('(Music)')) return 3;
                return 4;
            };
            finalTrackGroups.sort((a, b) => getGroupOrder(a.name) - getGroupOrder(b.name));

            if (runId !== calcRunIdRef.current) return;
            setTrackGroups(finalTrackGroups);
            setTotalDuration(finalDuration);
            setIsLoading(false);
        };

        calculateTimeline();
    }, [currentProject, selectedChapterId, characters, characterMap, soundLibrary, soundLibraryMap, setTimelineCurrentTime, setTimelineIsPlaying]);

    useEffect(() => {
        const audioContext = audioContextRef.current;
        if (!audioContext) return;
        
        const cleanup = () => {
            clearInterval(schedulerTimerRef.current);
            schedulerTimerRef.current = undefined;
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = undefined;
            }
            activeSourcesRef.current.forEach(source => {
                try { 
                    source.onended = null;
                    source.stop(); 
                    source.disconnect();
                } catch (e) { /* Ignore errors if already stopped */ }
            });
            activeSourcesRef.current.clear();
            playbackStartRef.current = null;
        };
        
        if (timelineIsPlaying) {
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
            scheduledClipsRef.current.clear();
            playbackStartRef.current = {
                contextTime: audioContext.currentTime,
                timelineTime: timelineCurrentTime,
            };
            const scheduleWindow = 0.5;
            const scheduleInterval = 250;

            const scheduler = () => {
                if (!playbackStartRef.current) return;
                
                const audioCtxTime = audioContext.currentTime;
                const elapsed = audioCtxTime - playbackStartRef.current.contextTime;
                const currentTime = playbackStartRef.current.timelineTime + elapsed;
                const scheduleAheadTime = currentTime + scheduleWindow;

                for (const clip of allClips) {
                    const isAlreadyScheduled = scheduledClipsRef.current.has(clip.id);
                    const shouldBePlaying = clip.startTime <= currentTime && clip.startTime + clip.duration > currentTime;
                    const willBePlayingSoon = clip.startTime > currentTime && clip.startTime < scheduleAheadTime;

                    if ((shouldBePlaying || willBePlayingSoon) && !isAlreadyScheduled) {
                        scheduledClipsRef.current.add(clip.id);

                        (async () => {
                            try {
                                let audioBlob: Blob | null = null;
                                if (clip.audioBlobId) {
                                    const audioBlobData = await db.audioBlobs.get(clip.audioBlobId);
                                    if (audioBlobData) audioBlob = audioBlobData.data;
                                } else if (clip.soundLibraryItem) {
                                    audioBlob = await soundLibraryRepository.getSoundFile(clip.soundLibraryItem, { requestPermission: false, allowRootResolve: true });
                                }
                                
                                if (!audioBlob) return;

                                const arrayBuffer = await audioBlob.arrayBuffer();
                                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                                
                                if (!timelineIsPlaying || !playbackStartRef.current) return;
                                
                                const source = audioContext.createBufferSource();
                                source.buffer = audioBuffer;
                                source.connect(audioContext.destination);

                                const startDelay = clip.startTime - playbackStartRef.current.timelineTime;
                                const playAt = playbackStartRef.current.contextTime + startDelay;
                                
                                let offset = 0;
                                let actualPlayTime = playAt;
                                
                                if (playAt < audioContext.currentTime) {
                                    offset = audioContext.currentTime - playAt;
                                    actualPlayTime = audioContext.currentTime;
                                }
                                
                                source.start(actualPlayTime, offset);
                                
                                activeSourcesRef.current.add(source);
                                source.onended = () => {
                                    activeSourcesRef.current.delete(source);
                                };
                            } catch (e) {
                                console.error(`Error scheduling clip ${clip.id}:`, e);
                                scheduledClipsRef.current.delete(clip.id);
                            }
                        })();
                    }
                }
            };
            scheduler();
            schedulerTimerRef.current = window.setInterval(scheduler, scheduleInterval);
            
            const rafLoop = () => {
                if (playbackStartRef.current) {
                    const elapsed = audioContext.currentTime - playbackStartRef.current.contextTime;
                    const newTime = playbackStartRef.current.timelineTime + elapsed;
                    if (newTime >= totalDuration) {
                        setTimelineCurrentTime(totalDuration);
                        setTimelineIsPlaying(false);
                    } else {
                        setTimelineCurrentTime(newTime);
                        animationFrameRef.current = requestAnimationFrame(rafLoop);
                    }
                }
            };
            animationFrameRef.current = requestAnimationFrame(rafLoop);
        }

        return cleanup;
    }, [timelineIsPlaying, allClips, totalDuration, setTimelineIsPlaying, setTimelineCurrentTime]);

    if (isLoading) {
        return (
            <div className="h-full flex flex-col">
                <TimelineHeader />
                <div className="flex-grow flex items-center justify-center">
                    <LoadingSpinner />
                    <p className="ml-2 text-slate-300">正在计算时间轴...</p>
                </div>
            </div>
        );
    }
    
    if (trackGroups.length === 0) {
        return (
            <div className="h-full flex flex-col">
                <TimelineHeader />
                <div className="flex-grow flex items-center justify-center">
                    <p className="text-center text-slate-500 text-sm p-4">没有已对轨的音频可供显示。</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-900">
            <TimelineHeader />
            <div
                className="w-full h-full overflow-auto relative"
                onMouseDownCapture={handleTimelineMouseDownCapture}
                onMouseDown={handleSeek}
            >
                <div 
                    className="relative" 
                    style={{ 
                        width: `${totalDuration * pixelsPerSecond + TRACK_HEADER_WIDTH_PX}px`, 
                        minWidth: '100%' 
                    }}
                >
                    {/* Spacer for sticky track headers */}
                    <div className="w-48 h-full float-left" />

                    {/* Main timeline content area */}
                    <div className="relative">
                        <TimeRuler duration={totalDuration} pixelsPerSecond={pixelsPerSecond} />
                        {trackGroups.map(group => (
                            <TrackGroup key={group.name} name={group.name} defaultExpanded={group.isExpanded}>
                                {group.tracks.map(track => (
                                    <Track
                                        key={`${group.name}-${track.name}`}
                                        name={track.name}
                                        clips={track.clips}
                                        pixelsPerSecond={pixelsPerSecond}
                                        trackType={track.type}
                                    />
                                ))}
                            </TrackGroup>
                        ))}
                    </div>
                </div>
                <Playhead pixelsPerSecond={pixelsPerSecond} leftOffset={TRACK_HEADER_WIDTH_PX} />
            </div>
        </div>
    );
};

export default Timeline;
