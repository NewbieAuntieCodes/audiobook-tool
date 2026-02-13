import React from 'react';
import {
  XMarkIcon,
  UndoIcon,
  RedoIcon,
  TrashIcon,
  SaveIcon,
  PlayIcon,
  PauseIcon,
  PlusIcon,
} from '../../../components/ui/icons';
import NumberInput from '../../../components/ui/NumberInput';

interface WaveformToolbarProps {
  isLoading: boolean;
  isPlaying: boolean;
  canUndo: boolean;
  canRedo: boolean;
  selectedMarkerIndex: number | null;
  skipHeadSegments: number;
  onSkipHeadSegmentsChange: (value: number) => void;
  onResetSkipHeadSegments: () => void;
  onSetSkipHeadFromSelectedMarker: () => void;
  onPlayPause: () => void;
  onAddMarker: () => void;
  onRemoveMarker: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onClose: () => void;
  sourceAudioFilename: string;
}

export const WaveformToolbar: React.FC<WaveformToolbarProps> = ({
  isLoading,
  isPlaying,
  canUndo,
  canRedo,
  selectedMarkerIndex,
  skipHeadSegments,
  onSkipHeadSegmentsChange,
  onResetSkipHeadSegments,
  onSetSkipHeadFromSelectedMarker,
  onPlayPause,
  onAddMarker,
  onRemoveMarker,
  onUndo,
  onRedo,
  onSave,
  onClose,
  sourceAudioFilename,
}) => {
  return (
    <div className="flex flex-wrap justify-between items-center gap-x-4 gap-y-2 mb-3 pb-3 border-b border-slate-700 flex-shrink-0">
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold text-slate-100">波形标记编辑器</h2>
        <p className="text-sm text-slate-400 truncate">{sourceAudioFilename}</p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        <div className="flex items-center gap-x-2">
          <span className="text-xs text-slate-400 whitespace-nowrap">跳过片头段数</span>
          <NumberInput
            value={skipHeadSegments}
            onChange={onSkipHeadSegmentsChange}
            step={1}
            min={0}
            max={99999}
            precision={0}
          />
          <button
            onClick={onSetSkipHeadFromSelectedMarker}
            disabled={isLoading || selectedMarkerIndex === null}
            className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-50"
            title="将选中的标记作为“正文开始”（正文第一句从该标记和下一个标记之间开始）"
          >
            用选中标记
          </button>
          <button
            onClick={onResetSkipHeadSegments}
            disabled={isLoading || skipHeadSegments === 0}
            className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-50"
            title="重置跳过片头段数为 0"
          >
            重置
          </button>
        </div>
        <button
          onClick={onPlayPause}
          disabled={isLoading}
          className="p-2 text-slate-300 hover:text-white disabled:opacity-50"
          title="播放/暂停 (空格)"
        >
          {isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
        </button>
        <div className="w-px h-6 bg-slate-600"></div>
        <button
          onClick={onAddMarker}
          disabled={isLoading}
          className="p-2 text-green-300 hover:text-green-100 disabled:opacity-30"
          title="在当前位置添加标记 (M)"
        >
          <PlusIcon className="w-5 h-5" />
        </button>
        <button
          onClick={onRemoveMarker}
          disabled={selectedMarkerIndex === null}
          className="p-2 text-red-300 hover:text-red-100 disabled:opacity-30 disabled:cursor-not-allowed"
          title="删除选中标记 (Delete/Backspace)"
        >
          <TrashIcon className="w-5 h-5" />
        </button>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-2 text-slate-300 hover:text-white disabled:opacity-50"
          title="撤销"
        >
          <UndoIcon />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="p-2 text-slate-300 hover:text-white disabled:opacity-50"
          title="重做"
        >
          <RedoIcon />
        </button>
        <div className="w-px h-6 bg-slate-600"></div>
        <button
          onClick={onSave}
          className="flex items-center px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md"
        >
          <SaveIcon className="w-4 h-4 mr-2" /> 保存并重新对齐
        </button>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-300 hover:text-white"
          title="关闭"
        >
          <XMarkIcon />
        </button>
      </div>
    </div>
  );
};
