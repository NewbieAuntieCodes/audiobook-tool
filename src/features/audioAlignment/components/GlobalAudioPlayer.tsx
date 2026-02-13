import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../../../store/useStore';
import { db } from '../../../db';
import { PauseIcon, PlayIcon, SpeakerWaveIcon, SpeakerXMarkIcon, XMarkIcon } from '../../../components/ui/icons';
import { getContrastingTextColor, isHexColor } from '../../../lib/colorUtils';
import { stripPostProductionMarkers } from '../../../lib/postProductionTextUtils';

const WAVE_BG_COLOR = '#475569'; // slate-600
const WAVE_PROGRESS_COLOR = '#38bdf8'; // sky-400
const PLAYHEAD_COLOR = '#f1f5f9'; // slate-100

const formatTime = (time: number) => {
  if (!Number.isFinite(time) || time <= 0) return '0:00';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const GlobalAudioPlayer: React.FC = () => {
  const { playingLineInfo, clearPlayingLine } = useStore((state) => ({
    playingLineInfo: state.playingLineInfo,
    clearPlayingLine: state.clearPlayingLine,
  }));

  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const animationFrameIdRef = useRef<number | null>(null);
  const loadRunIdRef = useRef(0);

  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return () => {
      try {
        audioContextRef.current?.close();
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    audioEl.volume = volume;
    audioEl.muted = isMuted;
  }, [volume, isMuted, audioSrc]);

  useEffect(() => {
    let objectUrl: string | null = null;
    const runId = ++loadRunIdRef.current;

    try {
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.currentTime = 0;
    } catch (_) {}

    setIsPlaying(false);
    setDuration(0);
    setCurrentTime(0);
    setAudioSrc(null);
    setAudioBuffer(null);

    const load = async () => {
      const blobId = playingLineInfo?.line.audioBlobId;
      if (!blobId) return;

      const audioBlob = await db.audioBlobs.get(blobId);
      if (!audioBlob || !audioContextRef.current) {
        clearPlayingLine();
        return;
      }

      objectUrl = URL.createObjectURL(audioBlob.data);
      if (loadRunIdRef.current !== runId) return;
      setAudioSrc(objectUrl);

      try {
        const arrayBuffer = await audioBlob.data.arrayBuffer();
        const decoded = await audioContextRef.current.decodeAudioData(arrayBuffer);
        if (loadRunIdRef.current !== runId) return;
        setAudioBuffer(decoded);
      } catch (e) {
        console.error('Error decoding audio data', e);
      }
    };

    void load();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
    };
  }, [playingLineInfo, clearPlayingLine]);

  const drawWaveform = useCallback((buffer: AudioBuffer | null, progress: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvasSizeRef.current;
    if (width <= 1 || height <= 1) return;

    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.clearRect(0, 0, width, height);

    ctx.lineWidth = 2;
    ctx.strokeStyle = WAVE_BG_COLOR;
    ctx.beginPath();
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      const start = i * step;
      const end = Math.min(start + step, data.length);
      for (let j = start; j < end; j++) {
        const datum = data[j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.moveTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }
    ctx.stroke();

    if (progress > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width * progress, height);
      ctx.clip();
      ctx.strokeStyle = WAVE_PROGRESS_COLOR;
      ctx.beginPath();
      for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        const start = i * step;
        const end = Math.min(start + step, data.length);
        for (let j = start; j < end; j++) {
          const datum = data[j];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
        ctx.moveTo(i, (1 + min) * amp);
        ctx.lineTo(i, (1 + max) * amp);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (progress > 0 && progress < 1) {
      ctx.beginPath();
      ctx.moveTo(width * progress, 0);
      ctx.lineTo(width * progress, height);
      ctx.lineWidth = 1;
      ctx.strokeStyle = PLAYHEAD_COLOR;
      ctx.stroke();
    }
  }, []);

  const animateProgress = useCallback(() => {
    const audioEl = audioRef.current;
    if (!audioEl || !audioBuffer) return;
    const d = audioEl.duration || 0;
    const progress = d > 0 ? Math.max(0, Math.min(1, audioEl.currentTime / d)) : 0;
    drawWaveform(audioBuffer, progress);
    animationFrameIdRef.current = requestAnimationFrame(animateProgress);
  }, [audioBuffer, drawWaveform]);

  useEffect(() => {
    if (isPlaying && audioBuffer) {
      animationFrameIdRef.current = requestAnimationFrame(animateProgress);
      return;
    }

    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

    if (audioRef.current && audioBuffer) {
      const d = audioRef.current.duration || 0;
      const progress = d > 0 ? Math.max(0, Math.min(1, audioRef.current.currentTime / d)) : 0;
      drawWaveform(audioBuffer, progress);
    }
  }, [isPlaying, audioBuffer, animateProgress, drawWaveform]);

  useEffect(() => {
    if (!audioRef.current?.paused) return;
    if (!audioBuffer || duration <= 0) return;
    const progress = currentTime / duration;
    if (!Number.isFinite(progress)) return;
    drawWaveform(audioBuffer, Math.max(0, Math.min(1, progress)));
  }, [currentTime, duration, audioBuffer, drawWaveform]);

  useEffect(() => {
    if (!audioBuffer || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      canvasSizeRef.current = { width: rect.width, height: rect.height };
    }
    drawWaveform(audioBuffer, 0);
  }, [audioBuffer, drawWaveform]);

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    setDuration(audioEl.duration || 0);
    audioEl.volume = volume;
    audioEl.muted = isMuted;

    const playPromise = audioEl.play();
    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        console.log('Audio auto-play was prevented or interrupted:', error);
      });
    }
  };

  const handlePlayPause = () => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    if (audioEl.paused) {
      const playPromise = audioEl.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.log('Manual play was interrupted or failed:', error);
        });
      }
    } else {
      audioEl.pause();
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const audioEl = audioRef.current;
    if (!canvas || !audioEl || !duration) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const progress = rect.width > 0 ? x / rect.width : 0;
    const newTime = Math.max(0, Math.min(duration, progress * duration));
    audioEl.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) audioRef.current.volume = newVolume;
    if (newVolume > 0) setIsMuted(false);
  };

  const handleMuteToggle = () => {
    setIsMuted((prev) => {
      const next = !prev;
      if (audioRef.current) audioRef.current.muted = next;
      if (!next && volume === 0) {
        setVolume(1);
        if (audioRef.current) audioRef.current.volume = 1;
      }
      return next;
    });
  };

  if (!playingLineInfo) {
    return null;
  }

  const { line, character } = playingLineInfo;
  const cleanLineText = stripPostProductionMarkers(line.text);
  const isNarration = !character || character.name.toLowerCase() === 'narrator';

  const getPanelStyle = () => {
    if (isNarration || !character) {
      return { style: {}, className: 'bg-slate-700 text-slate-100' };
    }

    const bgIsHex = isHexColor(character.color);
    const style: React.CSSProperties = {};
    let className = '';
    if (bgIsHex) style.backgroundColor = character.color;
    else className += ` ${character.color || 'bg-slate-700'}`;

    if (character.textColor) {
      if (isHexColor(character.textColor)) style.color = character.textColor;
      else className += ` ${character.textColor}`;
    } else {
      if (bgIsHex) style.color = getContrastingTextColor(character.color);
      else className += ' text-white';
    }

    return { style, className };
  };

  const panelStyle = getPanelStyle();

  return (
    <div
      className="fixed bottom-0 left-0 right-0 h-28 bg-slate-800 border-t border-slate-700 shadow-lg z-50 flex items-center p-4"
      aria-label="Global Audio Player"
      role="region"
    >
      <audio
        ref={audioRef}
        src={audioSrc || ''}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        muted={isMuted}
      />

      <button
        onClick={handlePlayPause}
        className="p-3 bg-slate-600 hover:bg-sky-500 rounded-full mr-4"
        aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
      >
        {isPlaying ? <PauseIcon className="w-6 h-6 text-white" /> : <PlayIcon className="w-6 h-6 text-white" />}
      </button>

      <div className="flex-grow flex flex-col justify-center space-y-2 overflow-hidden h-full">
        <div className="text-sm text-slate-300 truncate" title={cleanLineText}>
          <span className={`font-bold mr-2 py-0.5 px-2 rounded-md ${panelStyle.className}`} style={panelStyle.style}>
            {character?.name || '旁白'}
          </span>
          {cleanLineText}
        </div>

        <div className="flex items-center space-x-2 w-full h-12">
          <span className="text-xs text-slate-400 w-10 text-right" aria-label="Current time">
            {formatTime(currentTime)}
          </span>
          <div className="relative flex-grow h-full">
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full cursor-pointer"
              onClick={handleCanvasClick}
              aria-label="Audio waveform and progress"
            />
          </div>
          <span className="text-xs text-slate-400 w-10" aria-label="Total duration">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-2 ml-4">
        <button
          onClick={handleMuteToggle}
          className="p-1 text-slate-400 hover:text-white"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted || volume === 0 ? <SpeakerXMarkIcon className="w-5 h-5" /> : <SpeakerWaveIcon className="w-5 h-5" />}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className="w-24 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:bg-sky-400"
          aria-label="Volume control"
        />
      </div>

      <button onClick={clearPlayingLine} className="p-2 ml-2 text-slate-400 hover:text-white" aria-label="Close player">
        <XMarkIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

export default GlobalAudioPlayer;
