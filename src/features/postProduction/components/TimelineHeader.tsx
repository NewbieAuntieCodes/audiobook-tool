import React from 'react';
import { PlayIcon, PauseIcon, TrashIcon } from '../../../components/ui/icons';
import { useStore } from '../../../store/useStore';
import { soundLibraryRepository } from '../../../repositories/soundLibraryRepository';

const StopIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16" className={className}>
        <path d="M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z"/>
    </svg>
);

const LoopIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.092 1.21-.138 2.43-.138 3.662s.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.092-1.21.138-2.43.138-3.662z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return '00:00.000';
    const totalMs = Math.floor(seconds * 1000);
    const minutes = Math.floor(totalMs / 60000);
    const remainingMs = totalMs % 60000;
    const secs = Math.floor(remainingMs / 1000);
    const ms = remainingMs % 1000;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

const TimelineZoomControl: React.FC = () => {
  const { timelineZoom, setTimelineZoom } = useStore(state => ({
    timelineZoom: state.timelineZoom,
    setTimelineZoom: state.setTimelineZoom
  }));

  const minZoom = 0.1;
  const maxZoom = 5.0;
  
  const sliderValue = (Math.log(timelineZoom / minZoom) / Math.log(maxZoom / minZoom)) * 100;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    const newZoom = minZoom * Math.pow(maxZoom / minZoom, value / 100);
    setTimelineZoom(newZoom);
  };

  return (
    <div className="flex items-center gap-x-2">
      <span className="text-xs text-slate-400">缩放:</span>
      <input
        type="range"
        min="0"
        max="100"
        value={sliderValue}
        onChange={handleSliderChange}
        className="w-32 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, #38bdf8 0%, #38bdf8 ${sliderValue}%, #475569 ${sliderValue}%, #475569 100%)`,
        }}
        aria-label="时间轴缩放"
      />
      <button
        onClick={() => setTimelineZoom(0.3)}
        className="text-xs px-2 py-1 text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded"
      >
        重置
      </button>
    </div>
  );
};

const TimelineHeader: React.FC = () => {
    const { 
        timelineIsPlaying, 
        setTimelineIsPlaying, 
        timelineCurrentTime,
        stopTimeline,
        selectedProjectId,
        selectedChapterId,
        projects,
        updateProject,
    } = useStore();

    const handlePlayPause = async () => {
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
    };

    const handleClearPinnedSoundsForCurrentChapter = async () => {
        const projectId = selectedProjectId;
        const chapterId = selectedChapterId;
        if (!projectId) {
            alert('请先选择项目。');
            return;
        }
        if (!chapterId) {
            alert('请先展开/选择一个章节，再清空该章节的音效/BGM。');
            return;
        }
        const project = projects.find((p) => p.id === projectId);
        if (!project) return;

        const ok = window.confirm('确认清空当前章节的所有已钉住音效/BGM？此操作会移除该章节所有行的钉住数据。');
        if (!ok) return;

        stopTimeline();
        await updateProject({
            ...project,
            chapters: project.chapters.map((ch) => {
                if (ch.id !== chapterId) return ch;
                return {
                    ...ch,
                    scriptLines: ch.scriptLines.map((line) => ({ ...line, pinnedSounds: undefined })),
                };
            }),
        });
    };

    return (
        <div className="flex-shrink-0 flex items-center justify-between gap-4 p-2 bg-slate-800 border-b border-slate-700">
            <div className="flex items-center gap-4">
                <div className="flex items-center space-x-1">
                    <button title={timelineIsPlaying ? '暂停' : '播放'} onClick={handlePlayPause} className="p-2 rounded hover:bg-slate-700 text-slate-300">
                        {timelineIsPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
                    </button>
                    <button title="停止" onClick={stopTimeline} className="p-2 rounded hover:bg-slate-700 text-slate-300"><StopIcon className="w-4 h-4" /></button>
                    <button title="循环" className="p-2 rounded hover:bg-slate-700 text-slate-300 opacity-50 cursor-not-allowed"><LoopIcon className="w-5 h-5" /></button>
                </div>
                <div className="font-mono text-lg text-sky-300">
                    {formatTime(timelineCurrentTime)}
                </div>
            </div>
            <div className="flex items-center gap-x-3">
                <button
                    onClick={() => void handleClearPinnedSoundsForCurrentChapter()}
                    className="flex items-center text-xs px-2 py-1 text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded"
                    title="清空当前章节已钉住的音效/BGM"
                >
                    <TrashIcon className="w-4 h-4 mr-1" />
                    清空本章音效/BGM
                </button>
                <TimelineZoomControl />
            </div>
        </div>
    );
};

export default TimelineHeader;
