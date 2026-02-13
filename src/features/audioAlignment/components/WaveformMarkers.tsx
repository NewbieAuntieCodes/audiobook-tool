import React from 'react';

export interface WaveformMarker {
  index: number;
  time: number;
}

interface WaveformMarkersProps {
  markers: WaveformMarker[];
  pxPerSec: number;
  duration: number;
  segmentIndex: number;
  selectedMarkerIndex: number | null;
  mousePosition: { x: number; time: number } | null;
  isDraggingMarker: boolean;
  onMarkerMouseDown: (e: React.MouseEvent, index: number) => void;
  formatTime: (time: number) => string;
}

export const WaveformMarkers: React.FC<WaveformMarkersProps> = ({
  markers,
  pxPerSec,
  duration,
  segmentIndex,
  selectedMarkerIndex,
  mousePosition,
  isDraggingMarker,
  onMarkerMouseDown,
  formatTime,
}) => {
  return (
    <>
      {/* Mouse cursor helper line */}
      {mousePosition && !isDraggingMarker && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none z-20"
          style={{ left: `${mousePosition.x}px` }}
        >
          <div className="w-px h-full bg-cyan-400 opacity-50" />
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-cyan-400 rounded-full" />
          <div className="absolute top-4 left-2 text-xs px-2 py-0.5 rounded whitespace-nowrap bg-cyan-500 text-white shadow-lg">
            {formatTime(mousePosition.time)}
          </div>
        </div>
      )}

      {/* Render all markers */}
      {markers.map(({ index, time }) => {
        const leftPx = Math.max(0, (time || 0) * pxPerSec);
        const isStartMarker = segmentIndex > 0 && index === segmentIndex - 1;
        const isEndMarker = index === segmentIndex;
        const isHighlighted = isStartMarker || isEndMarker;
        const isSelected = selectedMarkerIndex === index;

        let lineColor = '#64748b';
        let markerColor = '#64748b';

        if (isHighlighted) {
          lineColor = isStartMarker ? '#3b82f6' : '#eab308';
          markerColor = isStartMarker ? '#3b82f6' : '#eab308';
        }

        return (
          <div key={index} style={{ left: `${leftPx}px` }} className="absolute top-0 bottom-0 z-20 group">
            <div
              style={{ borderLeft: `1px ${isHighlighted ? 'solid' : 'dashed'} ${lineColor}`, borderWidth: isHighlighted ? '2px' : '1px' }}
              className="absolute top-0 bottom-0 w-0 pointer-events-none"
            />
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 cursor-grab active:cursor-grabbing w-6 h-6 flex items-center justify-center"
              onMouseDown={(e) => onMarkerMouseDown(e, index)}
              title={`标记 ${index + 1} - 时间: ${formatTime(time)}\n点击选择，拖动移动`}
            >
              <div
                className={`transition-all rounded-full 
                  ${isSelected ? 'w-4 h-4' : isHighlighted ? 'w-3.5 h-3.5 animate-pulse' : 'w-3.5 h-3.5 group-hover:w-4 group-hover:h-4'}`}
                style={{
                  backgroundColor: markerColor,
                  border: isSelected ? '3px solid white' : (isHighlighted ? '2px solid white' : 'none'),
                  boxShadow: isSelected ? '0 0 12px 4px rgba(255,255,255,0.6)' : (isHighlighted ? '0 2px 4px rgba(0,0,0,0.3)' : 'none'),
                }}
              />
            </div>
            {(isSelected || isHighlighted) && (
              <div className={`absolute top-7 left-2 text-xs px-2 py-0.5 rounded whitespace-nowrap pointer-events-none shadow-lg ${
                isHighlighted
                  ? (isStartMarker ? 'bg-blue-500 text-white' : 'bg-yellow-500 text-white')
                  : 'bg-slate-500 text-white'
              }`}>
                {formatTime(time)}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};
