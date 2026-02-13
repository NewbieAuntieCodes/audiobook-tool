

import React, { useState, useEffect, useRef, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.js';
import { useStore } from '../../../store/useStore';
import { db } from '../../../db';
import { bufferToWav } from '../../../lib/wavEncoder';

const WAVE_BG_COLOR = '#334155';
const WAVE_PROGRESS_COLOR = '#38bdf8';
const PLAYHEAD_COLOR = '#f1f5f9';

const formatTime = (t: number) => {
  if (!isFinite(t)) return '0:00.000';
  const sign = t < 0 ? '-' : '';
  t = Math.max(0, Math.abs(t));
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60).toString().padStart(2, '0');
  const ms = Math.floor((t * 1000) % 1000).toString().padStart(3, '0');
  return `${sign}${m}:${s}.${ms}`;
};

/**
 * Generate initial markers from existing audio segments
 * by calculating cumulative durations of audio blobs that use this source audio
 */
const generateInitialMarkersFromSegments = async (sourceAudioId: string, projects: any[], selectedProjectId: string | null): Promise<number[]> => {
  try {
    // Find all audio blobs that use this source audio
    const allBlobs = await db.audioBlobs.toArray();
    const relevantBlobs = allBlobs.filter(blob => blob.sourceAudioId === sourceAudioId);

    if (relevantBlobs.length === 0) {
      return [];
    }

    // Get the project to determine the correct order of lines
    const currentProject = projects.find(p => p.id === selectedProjectId);
    if (!currentProject) {
      return [];
    }

    // Build a map of lineId to their position in the project
    const lineIdToPosition = new Map<string, number>();
    let position = 0;
    for (const chapter of currentProject.chapters) {
      for (const line of chapter.scriptLines) {
        lineIdToPosition.set(line.id, position++);
      }
    }

    // Sort blobs by their line position in the project
    relevantBlobs.sort((a, b) => {
      const posA = lineIdToPosition.get(a.lineId) ?? Infinity;
      const posB = lineIdToPosition.get(b.lineId) ?? Infinity;
      return posA - posB;
    });

    // Create an audio context to decode audio durations
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    try {
      const markers: number[] = [];
      let cumulativeTime = 0;

      // Decode each blob and calculate cumulative timestamps
      for (const blob of relevantBlobs) {
        const arrayBuffer = await blob.data.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const duration = audioBuffer.duration;

        // Add marker at the end of this segment (which is the start of the next)
        cumulativeTime += duration;
        markers.push(cumulativeTime);
      }

      // Remove the last marker since it would be at the end of the audio
      if (markers.length > 0) {
        markers.pop();
      }

      return markers;
    } finally {
      if (audioContext.state !== 'closed') {
        await audioContext.close();
      }
    }
  } catch (error) {
    console.error('Failed to generate initial markers:', error);
    return [];
  }
};

interface UseWaveSurferProps {
  isOpen: boolean;
  sourceAudioInfo: { id: string; filename: string };
  currentLineId: string;
  contextLines?: number;
  onSave: (sourceAudioId: string, markers: number[], skipHeadSegments: number) => void;
  refs: {
    waveformRef: React.RefObject<HTMLDivElement>;
    timelineRef: React.RefObject<HTMLDivElement>;
    scrollRef: React.RefObject<HTMLDivElement>;
    contentRef: React.RefObject<HTMLDivElement>;
  };
}

export const useWaveSurfer = ({
  isOpen,
  sourceAudioInfo,
  currentLineId,
  contextLines = 2,
  onSave,
  refs,
}: UseWaveSurferProps) => {
  const { waveformRef, timelineRef, scrollRef, contentRef } = refs;
  const { projects, selectedProjectId } = useStore(state => ({
    projects: state.projects,
    selectedProjectId: state.selectedProjectId,
  }));

  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const fullAudioBufferRef = useRef<AudioBuffer | null>(null);
  const fullDurationRef = useRef(0);
  const markersRef = useRef<number[]>([]);
  const viewWindowStartRef = useRef(0);
  const viewWindowEndRef = useRef(0);
  const skipHeadSegmentsRef = useRef(0);
  const loadRunIdRef = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [skipHeadSegments, setSkipHeadSegments] = useState(0);

  // State slices
  const [wavesurferState, setWavesurferState] = useState({
    isPlaying: false,
    duration: 0,
    pxPerSec: 0,
    zoomLevel: 1,
    isReady: false,
  });

  const [historyState, setHistoryState] = useState<{
    history: number[][];
    index: number;
    canUndo: boolean;
    canRedo: boolean;
  }>({ history: [], index: -1, canUndo: false, canRedo: false });

  const [markerState, setMarkerState] = useState<{
    markers: number[];
    selectedMarkerIndex: number | null;
    isDraggingMarker: boolean;
    localLineIndex: number;
    segmentIndex: number;
    mousePosition: { x: number; time: number } | null;
  }>({
    markers: [],
    selectedMarkerIndex: null,
    isDraggingMarker: false,
    localLineIndex: -1,
    segmentIndex: -1,
    mousePosition: null,
  });

  const visibleMarkers = markerState.markers
    .map((time, index) => ({ index, time }))
    .filter(({ time }) => time >= viewWindowStartRef.current && time <= viewWindowEndRef.current)
    .map(({ index, time }) => ({ index, time: time - viewWindowStartRef.current }));

  useEffect(() => {
    markersRef.current = markerState.markers;
  }, [markerState.markers]);

  useEffect(() => {
    skipHeadSegmentsRef.current = skipHeadSegments;
  }, [skipHeadSegments]);

  const pushToHistory = useCallback((newState: number[]) => {
    setHistoryState(prev => {
      const newHistory = prev.history.slice(0, prev.index + 1);
      newHistory.push(newState);
      const newIndex = newHistory.length - 1;
      return {
        history: newHistory,
        index: newIndex,
        canUndo: newIndex > 0,
        canRedo: false,
      };
    });
    setMarkerState(prev => ({ ...prev, markers: newState }));
  }, []);

  const calculateLocalLineIndex = useCallback(async (): Promise<number> => {
    if (!currentLineId || !sourceAudioInfo.id) return -1;
    const currentProject = projects.find(p => p.id === selectedProjectId);
    if (!currentProject) return -1;
    const lineWithBlobIds = currentProject.chapters
      .flatMap(ch => ch.scriptLines.map(line => ({ lineId: line.id, blobId: line.audioBlobId })))
      .filter(l => l.blobId);
    const blobs = await db.audioBlobs.bulkGet(lineWithBlobIds.map(l => l.blobId!));
    const validLineIds = new Set(
      blobs
        .map((b, i) => (b?.sourceAudioId === sourceAudioInfo.id ? lineWithBlobIds[i].lineId : null))
        .filter((v): v is string => !!v)
    );
    const orderedLines = lineWithBlobIds.filter(l => validLineIds.has(l.lineId));
    return orderedLines.findIndex(item => item.lineId === currentLineId);
  }, [currentLineId, sourceAudioInfo.id, projects, selectedProjectId]);

  const computeViewWindow = useCallback((markers: number[], segmentIndex: number, fullDuration: number, minSegmentIndex = 0) => {
    const sortedMarkers = [...markers].sort((a, b) => a - b);
    const segmentCount = sortedMarkers.length + 1;

    if (segmentIndex < 0 || segmentCount <= 0 || contextLines < 0) {
      return {
        start: 0,
        end: fullDuration,
        currentLineStart: 0,
      };
    }

    const safeMinSegmentIndex = Math.max(0, Math.min(minSegmentIndex, segmentCount - 1));
    const clampedSegmentIndex = Math.max(safeMinSegmentIndex, Math.min(segmentIndex, segmentCount - 1));
    const startSegment = Math.max(safeMinSegmentIndex, clampedSegmentIndex - contextLines);
    const endSegment = Math.min(segmentCount - 1, clampedSegmentIndex + contextLines);

    const start = startSegment === 0 ? 0 : (sortedMarkers[startSegment - 1] ?? 0);
    const end = endSegment < sortedMarkers.length ? (sortedMarkers[endSegment] ?? fullDuration) : fullDuration;
    const currentLineStart = clampedSegmentIndex === 0 ? 0 : (sortedMarkers[clampedSegmentIndex - 1] ?? 0);

    const baseStart = Math.max(0, Math.min(start, fullDuration));
    const baseEnd = Math.max(0, Math.min(end, fullDuration));
    const baseCurrentLineStart = Math.max(0, Math.min(currentLineStart, fullDuration));

    // Give a little room to drag boundary markers earlier/later without leaving the window.
    const paddingSeconds = 2;
    const paddedStart = Math.max(0, Math.min(baseStart - paddingSeconds, fullDuration));
    const paddedEnd = Math.max(0, Math.min(baseEnd + paddingSeconds, fullDuration));

    return {
      start: paddedStart,
      end: Math.max(paddedStart, paddedEnd),
      currentLineStart: baseCurrentLineStart,
    };
  }, [contextLines]);

  const sliceAudioToWavBlob = useCallback((audioContext: AudioContext, audioBuffer: AudioBuffer, startTime: number, endTime: number): Blob => {
    const start = Math.max(0, Math.min(startTime, audioBuffer.duration));
    const end = Math.max(0, Math.min(endTime, audioBuffer.duration));
    const startSample = Math.floor(start * audioBuffer.sampleRate);
    const endSample = Math.floor(end * audioBuffer.sampleRate);
    const frameCount = Math.max(0, endSample - startSample);

    if (frameCount <= 0) {
      return bufferToWav(audioBuffer);
    }

    const segmentBuffer = audioContext.createBuffer(
      audioBuffer.numberOfChannels,
      frameCount,
      audioBuffer.sampleRate
    );

    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      segmentBuffer.copyToChannel(audioBuffer.getChannelData(ch).subarray(startSample, endSample), ch);
    }

    return bufferToWav(segmentBuffer);
  }, []);

  // WaveSurfer instance lifecycle
  useEffect(() => {
    if (!(isOpen && waveformRef.current && timelineRef.current)) return;
    setIsLoading(true);
    setError(null);

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive', sampleRate: 48000 });
    audioContextRef.current = audioContext;
    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: WAVE_BG_COLOR,
      progressColor: WAVE_PROGRESS_COLOR,
      cursorColor: PLAYHEAD_COLOR,
      barWidth: 2,
      barRadius: 2,
      height: 200,
      interact: true,
      fillParent: true,
      minPxPerSec: 1,
      audioRate: 1,
      backend: 'WebAudio',
      normalize: false,
      // FIX: The type definitions for wavesurfer.js may be outdated and don't include the `audioContext` property, causing a type error. Ignoring the error as this is a valid option.
      // @ts-ignore
      audioContext: audioContext,
      plugins: [
        // FIX: Styling options like `primaryColor` are deprecated in modern versions of the wavesurfer.js timeline plugin.
        // Styling is now handled via CSS. Removing these properties aligns with the modern API.
        TimelinePlugin.create({ container: timelineRef.current! })
      ]
    });
    wavesurferRef.current = ws;

    const loadAudioAndMarkers = async () => {
        const runId = ++loadRunIdRef.current;
        try {
            const masterAudio = await db.masterAudios.get(sourceAudioInfo.id);
            if (!masterAudio) throw new Error('母带音频未找到');

            const arrayBuffer = await masterAudio.data.arrayBuffer();
            const decoded = await audioContext.decodeAudioData(arrayBuffer);
            fullAudioBufferRef.current = decoded;
            fullDurationRef.current = decoded.duration;

            const markerSet = await db.audioMarkers.get(sourceAudioInfo.id);
            let loadedSkipHeadSegments = Math.max(0, Math.floor(markerSet?.skipHeadSegments ?? 0));
            let markersToUse: number[];
            if (markerSet?.markers?.length > 0) {
                markersToUse = markerSet.markers;
            } else {
              // Generate initial markers from existing audio segments (relative to the first assigned line)
              const initialMarkers = await generateInitialMarkersFromSegments(sourceAudioInfo.id, projects, selectedProjectId);
              markersToUse = initialMarkers;
            }

            // Backward-compat: legacy trimStart (seconds) => treat as an "intro segment" boundary marker.
            const legacyTrimStart = Math.max(0, markerSet?.trimStart ?? 0);
            if (markerSet && markerSet.skipHeadSegments == null && legacyTrimStart > 0) {
              loadedSkipHeadSegments = 1;
              markersToUse = [legacyTrimStart, ...markersToUse.map(m => legacyTrimStart + m)];
            }

            const fullDuration = decoded.duration;
            const normalizedMarkers = markersToUse
              .filter((m) => Number.isFinite(m))
              .map((m) => Math.max(0, Math.min(fullDuration, m)))
              .filter((m) => m > 0 && m < fullDuration)
              .sort((a, b) => a - b)
              .filter((m, i, arr) => i === 0 || m - arr[i - 1] > 1e-4);

            loadedSkipHeadSegments = Math.max(0, Math.min(loadedSkipHeadSegments, normalizedMarkers.length));

            if (loadRunIdRef.current !== runId) return;

            setSkipHeadSegments(loadedSkipHeadSegments);
            skipHeadSegmentsRef.current = loadedSkipHeadSegments;

            setMarkerState(prev => ({...prev, markers: normalizedMarkers }));
            setHistoryState({ history: [normalizedMarkers], index: 0, canUndo: false, canRedo: false });

            const localLineIndex = await calculateLocalLineIndex();
            if (loadRunIdRef.current !== runId) return;

            const segmentIndex = localLineIndex >= 0 ? localLineIndex + loadedSkipHeadSegments : -1;
            const view = computeViewWindow(normalizedMarkers, segmentIndex, fullDuration, loadedSkipHeadSegments);
            viewWindowStartRef.current = view.start;
            viewWindowEndRef.current = view.end;

            setMarkerState(prev => ({
              ...prev,
              localLineIndex,
              segmentIndex,
              selectedMarkerIndex: null,
              mousePosition: null,
            }));

            setWavesurferState(prev => ({ ...prev, isReady: false, isPlaying: false, duration: 0, pxPerSec: 0 }));
            setIsLoading(true);

            const windowBlob = sliceAudioToWavBlob(
              audioContext,
              decoded,
              view.start,
              view.end
            );
            await ws.loadBlob(windowBlob);
            if (loadRunIdRef.current !== runId) return;

            if (scrollRef.current) {
              scrollRef.current.scrollLeft = 0;
            }

            const localSeekTime = Math.max(0, Math.min(ws.getDuration(), view.currentLineStart - view.start));
            ws.setTime(localSeekTime);
// FIX: Catch block parameter must be of type 'any' or 'unknown' if specified. Safely handle the error object by checking its type before accessing properties.
        } catch (e: unknown) {
            if (loadRunIdRef.current !== runId) return;
            setError(e instanceof Error ? e.message : '加载音频失败');
            setIsLoading(false);
        }
    };
    loadAudioAndMarkers();

    ws.on('play', () => setWavesurferState(prev => ({ ...prev, isPlaying: true })));
    ws.on('pause', () => setWavesurferState(prev => ({ ...prev, isPlaying: false })));
    ws.on('finish', () => setWavesurferState(prev => ({ ...prev, isPlaying: false })));
    ws.on('ready', () => {
      setWavesurferState(prev => ({ ...prev, duration: ws.getDuration(), isReady: true }));
      setIsLoading(false);
    });
    ws.on('click', (relativePos: number) => {
        ws.seekTo(relativePos);
        if (!markerState.isDraggingMarker) setMarkerState(prev => ({ ...prev, selectedMarkerIndex: null }));
    });

    return () => {
      loadRunIdRef.current++;
      ws.destroy();
      if (audioContext.state !== 'closed') audioContext.close();
      wavesurferRef.current = null;
      audioContextRef.current = null;
      fullAudioBufferRef.current = null;
      fullDurationRef.current = 0;
      viewWindowStartRef.current = 0;
      viewWindowEndRef.current = 0;
      setWavesurferState(prev => ({ ...prev, isReady: false, duration: 0, pxPerSec: 0 }));
    };
  }, [isOpen, sourceAudioInfo.id]);

  useEffect(() => {
    const refreshWindowForLine = async () => {
      if (!isOpen) return;
      const ws = wavesurferRef.current;
      const audioContext = audioContextRef.current;
      const fullBuffer = fullAudioBufferRef.current;
      if (!ws || !audioContext || !fullBuffer) return;

      const runId = ++loadRunIdRef.current;
      try {
        setIsLoading(true);
        const localLineIndex = await calculateLocalLineIndex();
        if (loadRunIdRef.current !== runId) return;

        const fullDuration = fullDurationRef.current || fullBuffer.duration;
        const segmentIndex = localLineIndex >= 0 ? localLineIndex + skipHeadSegmentsRef.current : -1;
        const view = computeViewWindow(markersRef.current, segmentIndex, fullDuration, skipHeadSegmentsRef.current);
        viewWindowStartRef.current = view.start;
        viewWindowEndRef.current = view.end;

        setMarkerState(prev => ({
          ...prev,
          localLineIndex,
          segmentIndex,
          selectedMarkerIndex: null,
          mousePosition: null,
        }));

        setWavesurferState(prev => ({ ...prev, isReady: false, isPlaying: false, duration: 0, pxPerSec: 0 }));

        const windowBlob = sliceAudioToWavBlob(
          audioContext,
          fullBuffer,
          view.start,
          view.end
        );
        await ws.loadBlob(windowBlob);
        if (loadRunIdRef.current !== runId) return;

        if (scrollRef.current) {
          scrollRef.current.scrollLeft = 0;
        }

        const localSeekTime = Math.max(0, Math.min(ws.getDuration(), view.currentLineStart - view.start));
        ws.setTime(localSeekTime);
      } catch (e) {
        if (loadRunIdRef.current !== runId) return;
        console.error('Failed to refresh waveform window:', e);
        setIsLoading(false);
      }
    };

    void refreshWindowForLine();
  }, [currentLineId, contextLines, isOpen, calculateLocalLineIndex, computeViewWindow, sliceAudioToWavBlob, skipHeadSegments]);
  
  // Zoom logic
  useEffect(() => {
    if (!wavesurferRef.current || !scrollRef.current || wavesurferState.duration <= 0) return;
    const containerWidth = scrollRef.current.clientWidth || 1;
    const basePxPerSec = containerWidth / wavesurferState.duration;
    const computedPxPerSec = basePxPerSec * wavesurferState.zoomLevel;
    setWavesurferState(prev => ({...prev, pxPerSec: computedPxPerSec }));
  }, [wavesurferState.duration, wavesurferState.zoomLevel, scrollRef]);
  
  useEffect(() => {
    if (wavesurferRef.current && wavesurferState.isReady && wavesurferState.pxPerSec > 0) {
      try {
        wavesurferRef.current.zoom(wavesurferState.pxPerSec);
      } catch (err) {
        console.error('Zoom error:', err);
      }
    }
  }, [wavesurferState.pxPerSec, wavesurferState.isReady]);

  // Interaction handlers
  const handlePlayPause = useCallback(() => wavesurferRef.current?.playPause(), []);
  const handlePause = useCallback(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    try {
      ws.pause();
    } catch (err) {
      console.error('Pause error:', err);
    }
  }, []);
  const handleAddMarker = useCallback(() => {
    if (wavesurferRef.current) {
        const localTime = wavesurferRef.current.getCurrentTime();
        const relativeTime = viewWindowStartRef.current + localTime;
        pushToHistory([...markerState.markers, relativeTime].sort((a, b) => a - b));
    }
  }, [markerState.markers, pushToHistory]);
  const handleRemoveMarker = useCallback(() => {
    if (markerState.selectedMarkerIndex !== null) {
        pushToHistory(markerState.markers.filter((_, i) => i !== markerState.selectedMarkerIndex));
        setMarkerState(prev => ({...prev, selectedMarkerIndex: null}));
    }
  }, [markerState.markers, markerState.selectedMarkerIndex, pushToHistory]);
  const handleUndo = useCallback(() => {
    if (historyState.canUndo) {
        const newIndex = historyState.index - 1;
        setHistoryState(prev => ({ ...prev, index: newIndex, canUndo: newIndex > 0, canRedo: true }));
        setMarkerState(prev => ({...prev, markers: historyState.history[newIndex]}));
    }
  }, [historyState.canUndo, historyState.index, historyState.history]);
  const handleRedo = useCallback(() => {
    if (historyState.canRedo) {
        const newIndex = historyState.index + 1;
        setHistoryState(prev => ({ ...prev, index: newIndex, canUndo: true, canRedo: newIndex < prev.history.length - 1 }));
        setMarkerState(prev => ({...prev, markers: historyState.history[newIndex]}));
    }
  }, [historyState.canRedo, historyState.index, historyState.history]);
  const handleSave = useCallback(() => onSave(sourceAudioInfo.id, markerState.markers, skipHeadSegmentsRef.current), [onSave, sourceAudioInfo.id, markerState.markers, skipHeadSegments]);
  const handleZoomChange = useCallback((level: number) => setWavesurferState(prev => ({...prev, zoomLevel: level})), []);
  const handleSkipHeadSegmentsChange = useCallback((value: number) => {
    const maxSkip = markersRef.current.length;
    const clamped = Math.max(0, Math.min(Math.floor(value), maxSkip));
    setSkipHeadSegments(clamped);
  }, []);
  const handleResetSkipHeadSegments = useCallback(() => setSkipHeadSegments(0), []);
  const handleSetSkipHeadFromSelectedMarker = useCallback(() => {
    if (markerState.selectedMarkerIndex === null) return;
    const maxSkip = markersRef.current.length;
    const clamped = Math.max(0, Math.min(markerState.selectedMarkerIndex + 1, maxSkip));
    setSkipHeadSegments(clamped);
  }, [markerState.selectedMarkerIndex]);
  
  // Mouse and Keyboard interactions
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Space') { e.preventDefault(); handlePlayPause(); }
        else if (e.code === 'KeyM') { e.preventDefault(); handleAddMarker(); }
        else if ((e.code === 'Delete' || e.code === 'Backspace') && markerState.selectedMarkerIndex !== null) { e.preventDefault(); handleRemoveMarker(); }
    };
    const scrollContainer = scrollRef.current;
    const handleWheel = (e: WheelEvent) => {
        if (!contentRef.current || wavesurferState.pxPerSec <= 0) return;
        e.preventDefault();
        const rect = scrollContainer!.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseTime = (scrollContainer!.scrollLeft + mouseX) / wavesurferState.pxPerSec;
        const newZoomLevel = Math.max(0.1, Math.min(50, wavesurferState.zoomLevel * (e.deltaY > 0 ? 0.8 : 1.25)));
        setWavesurferState(prev => ({ ...prev, zoomLevel: newZoomLevel }));
        requestAnimationFrame(() => {
            const newPxPerSec = (scrollContainer!.clientWidth / wavesurferState.duration) * newZoomLevel;
            scrollContainer!.scrollLeft = Math.max(0, mouseTime * newPxPerSec - mouseX);
        });
    };
    const handleMouseDown = (e: MouseEvent) => {
        if (e.button === 1) {
            e.preventDefault();
            setIsPanning(true);
            const startX = e.clientX;
            const startScrollLeft = scrollContainer!.scrollLeft;
            const handleMouseMove = (me: MouseEvent) => { scrollContainer!.scrollLeft = startScrollLeft + (startX - me.clientX); };
            const handleMouseUp = () => { setIsPanning(false); document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    if (scrollContainer) {
        scrollContainer.addEventListener('wheel', handleWheel, { passive: false });
        scrollContainer.addEventListener('mousedown', handleMouseDown);
    }
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        if (scrollContainer) {
            scrollContainer.removeEventListener('wheel', handleWheel);
            scrollContainer.removeEventListener('mousedown', handleMouseDown);
        }
    };
  }, [isOpen, handlePlayPause, handleAddMarker, handleRemoveMarker, markerState.selectedMarkerIndex, scrollRef, contentRef, wavesurferState.pxPerSec, wavesurferState.zoomLevel, wavesurferState.duration]);

  // Marker drag logic
  const handleMarkerMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    let hasMoved = false;
    let currentMarkers = [...markerState.markers];
    
    const handleMouseMove = (me: MouseEvent) => {
        if (!hasMoved) {
            hasMoved = true;
            setMarkerState(prev => ({...prev, isDraggingMarker: true, selectedMarkerIndex: index}));
        }
        if (contentRef.current && wavesurferState.pxPerSec > 0) {
            const rect = contentRef.current.getBoundingClientRect();
            const offset = scrollRef.current?.scrollLeft || 0;
            const x = me.clientX - rect.left + offset;
            const localTime = Math.max(0, Math.min(wavesurferState.duration, x / wavesurferState.pxPerSec));
            const newTime = viewWindowStartRef.current + localTime;
            currentMarkers = [...markerState.markers];
            currentMarkers[index] = newTime;
            currentMarkers.sort((a, b) => a - b);
            setMarkerState(prev => ({...prev, markers: currentMarkers}));
        }
    };

    const handleMouseUp = () => {
        if (hasMoved) {
            pushToHistory(currentMarkers);
        } else {
            setMarkerState(prev => ({...prev, selectedMarkerIndex: prev.selectedMarkerIndex === index ? null : index}));
        }
        setMarkerState(prev => ({...prev, isDraggingMarker: false}));
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [markerState.markers, contentRef, scrollRef, wavesurferState.pxPerSec, wavesurferState.duration, pushToHistory]);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (!markerState.isDraggingMarker && e.target === e.currentTarget) {
        setMarkerState(prev => ({...prev, selectedMarkerIndex: null}));
    }
  }, [markerState.isDraggingMarker]);
  
  const handleContentMouseMove = useCallback((e: React.MouseEvent) => {
    if (contentRef.current && wavesurferState.pxPerSec > 0) {
        const rect = contentRef.current.getBoundingClientRect();
        const offset = scrollRef.current?.scrollLeft || 0;
        const x = e.clientX - rect.left + offset;
        const time = x / wavesurferState.pxPerSec;
        if (time >= 0 && time <= wavesurferState.duration) {
            setMarkerState(prev => ({...prev, mousePosition: { x, time }}));
        }
    }
  }, [contentRef, scrollRef, wavesurferState.pxPerSec, wavesurferState.duration]);

  const handleContentMouseLeave = useCallback(() => {
    setMarkerState(prev => ({...prev, mousePosition: null}));
  }, []);

  return {
    isLoading,
    error,
    isPanning,
    wavesurferState,
    historyState,
    markerState: {
      ...markerState,
      formatTime,
      visibleMarkers,
      skipHeadSegments,
      viewWindowStart: viewWindowStartRef.current,
      viewWindowEnd: viewWindowEndRef.current,
    },
    interactionHandlers: {
      handlePlayPause,
      handlePause,
      handleAddMarker,
      handleRemoveMarker,
      handleUndo,
      handleRedo,
      handleSave,
      handleZoomChange,
      handleSkipHeadSegmentsChange,
      handleResetSkipHeadSegments,
      handleSetSkipHeadFromSelectedMarker,
      handleMarkerMouseDown,
      handleContainerClick,
      handleContentMouseMove,
      handleContentMouseLeave,
    },
  };
};
