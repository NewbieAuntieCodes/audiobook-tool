import React, { useRef } from 'react';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import { useWaveSurfer } from '../hooks/useWaveSurfer';
import { WaveformToolbar } from './WaveformToolbar';
import { WaveformZoomControl } from './WaveformZoomControl';
import { WaveformMarkers } from './WaveformMarkers';
import { WaveformHotkeysInfo } from './WaveformHotkeysInfo';

interface AudioWaveformEditorProps {
  isOpen: boolean;
  layout?: 'modal' | 'dock';
  onClose: () => void;
  onSave: (sourceAudioId: string, markers: number[], skipHeadSegments: number) => void;
  sourceAudioInfo: { id: string; filename: string };
  currentLineId: string;
  currentLineIndex: number;
}

const AudioWaveformEditor: React.FC<AudioWaveformEditorProps> = ({
  isOpen,
  layout = 'modal',
  onClose,
  onSave,
  sourceAudioInfo,
  currentLineId,
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);

  const {
    isLoading,
    error,
    isPanning,
    wavesurferState,
    historyState,
    markerState,
    interactionHandlers,
  } = useWaveSurfer({
    isOpen,
    sourceAudioInfo,
    currentLineId,
    onSave,
    refs: {
      waveformRef,
      timelineRef,
      scrollRef,
      contentRef,
    },
  });

  if (!isOpen) return null;

  const handleClose = () => {
    interactionHandlers.handlePause();
    onClose();
  };

  const editorBody = (
    <div
      className={
        layout === 'dock'
          ? 'h-full flex flex-col bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-4'
          : 'bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col border border-slate-700'
      }
    >
      <WaveformToolbar
        isLoading={isLoading}
        isPlaying={wavesurferState.isPlaying}
        canUndo={historyState.canUndo}
        canRedo={historyState.canRedo}
        selectedMarkerIndex={markerState.selectedMarkerIndex}
        skipHeadSegments={markerState.skipHeadSegments}
        onSkipHeadSegmentsChange={interactionHandlers.handleSkipHeadSegmentsChange}
        onResetSkipHeadSegments={interactionHandlers.handleResetSkipHeadSegments}
        onSetSkipHeadFromSelectedMarker={interactionHandlers.handleSetSkipHeadFromSelectedMarker}
        onPlayPause={interactionHandlers.handlePlayPause}
        onAddMarker={interactionHandlers.handleAddMarker}
        onRemoveMarker={interactionHandlers.handleRemoveMarker}
        onUndo={interactionHandlers.handleUndo}
        onRedo={interactionHandlers.handleRedo}
        onSave={interactionHandlers.handleSave}
        onClose={handleClose}
        sourceAudioFilename={sourceAudioInfo.filename}
      />

      <div className="flex-grow flex flex-col relative overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 bg-slate-800/80 flex items-center justify-center z-30">
            <LoadingSpinner />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 bg-slate-800/80 flex items-center justify-center text-red-400 z-30">
            {error}
          </div>
        )}

        <WaveformZoomControl
          zoomLevel={wavesurferState.zoomLevel}
          onZoomChange={interactionHandlers.handleZoomChange}
          onResetZoom={() => interactionHandlers.handleZoomChange(1)}
        />

        <div ref={timelineRef} className="h-5 flex-shrink-0"></div>

        <div
          className="relative flex-grow"
          onClick={interactionHandlers.handleContainerClick}
        >
          <div
            ref={scrollRef}
            className={`absolute inset-0 overflow-x-auto overflow-y-hidden ${
              isPanning ? 'cursor-grabbing' : 'cursor-default'
            }`}
          >
            <div
              ref={contentRef}
              className="relative h-full"
              style={{ width: `${Math.max(0, wavesurferState.duration * wavesurferState.pxPerSec)}px` }}
              onMouseMove={interactionHandlers.handleContentMouseMove}
              onMouseLeave={interactionHandlers.handleContentMouseLeave}
            >
              <div ref={waveformRef} className="absolute inset-0 z-0" />
              <WaveformMarkers
                markers={markerState.visibleMarkers}
                pxPerSec={wavesurferState.pxPerSec}
                duration={wavesurferState.duration}
                segmentIndex={markerState.segmentIndex}
                selectedMarkerIndex={markerState.selectedMarkerIndex}
                mousePosition={markerState.mousePosition}
                isDraggingMarker={markerState.isDraggingMarker}
                onMarkerMouseDown={interactionHandlers.handleMarkerMouseDown}
                // FIX: Pass the required `formatTime` function from `markerState` to the `WaveformMarkers` component.
                formatTime={markerState.formatTime}
              />
            </div>
          </div>
        </div>

        <WaveformHotkeysInfo />
      </div>
    </div>
  );

  if (layout === 'dock') {
    return editorBody;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-85 flex items-center justify-center z-[110] p-4">
      {editorBody}
    </div>
  );
};

export default AudioWaveformEditor;
