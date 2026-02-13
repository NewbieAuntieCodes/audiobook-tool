
import React, { useState, useCallback, useRef, useEffect } from 'react';

interface ResizablePanelsProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  initialLeftWidthPercent?: number;
  resizeMode?: 'live' | 'commit';
  minLeftWidthPercent?: number;
  maxLeftWidthPercent?: number;
}

const ResizablePanels: React.FC<ResizablePanelsProps> = ({
  leftPanel,
  rightPanel,
  initialLeftWidthPercent = 40,
  resizeMode = 'live',
  minLeftWidthPercent = 15,
  maxLeftWidthPercent = 85,
}) => {
  const [leftWidth, setLeftWidth] = useState(initialLeftWidthPercent);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);

  const pendingLeftWidthRef = useRef(leftWidth);
  const ghostLineRef = useRef<HTMLDivElement>(null);
  const ghostRafRef = useRef<number | null>(null);
  const latestGhostWidthRef = useRef(leftWidth);

  useEffect(() => {
    pendingLeftWidthRef.current = leftWidth;
    latestGhostWidthRef.current = leftWidth;
  }, [leftWidth]);

  useEffect(() => {
    return () => {
      if (ghostRafRef.current !== null) {
        cancelAnimationFrame(ghostRafRef.current);
      }
    };
  }, []);

  const updateGhostLine = useCallback((percent: number) => {
    latestGhostWidthRef.current = percent;

    if (ghostRafRef.current !== null) return;
    ghostRafRef.current = requestAnimationFrame(() => {
      ghostRafRef.current = null;
      if (!containerRef.current || !ghostLineRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const dividerWidth = dividerRef.current?.getBoundingClientRect().width || 0;
      const usableWidth = Math.max(0, containerRect.width - dividerWidth);
      const px = (usableWidth * latestGhostWidthRef.current) / 100;

      ghostLineRef.current.style.transform = `translateX(${px}px)`;
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    pendingLeftWidthRef.current = leftWidth;
    setIsResizing(true);
  }, [leftWidth]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    if (resizeMode === 'commit') {
      setLeftWidth(pendingLeftWidthRef.current);
    }
  }, [resizeMode]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
    const nextLeftWidth = Math.min(maxLeftWidthPercent, Math.max(minLeftWidthPercent, newLeftWidth));

    if (resizeMode === 'live') {
      setLeftWidth(nextLeftWidth);
      return;
    }

    pendingLeftWidthRef.current = nextLeftWidth;
    updateGhostLine(nextLeftWidth);
  }, [isResizing, resizeMode, minLeftWidthPercent, maxLeftWidthPercent, updateGhostLine]);

  useEffect(() => {
    if (!isResizing) return;

    if (resizeMode === 'commit') {
      updateGhostLine(pendingLeftWidthRef.current);
    }

    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [isResizing, resizeMode, updateGhostLine]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const showGhost = isResizing && resizeMode === 'commit';

  return (
    <div ref={containerRef} className="relative flex h-full w-full overflow-hidden bg-slate-900">
      {showGhost && (
        <div className="absolute inset-0 pointer-events-none z-10">
          <div
            ref={ghostLineRef}
            className="absolute top-0 bottom-0 w-[3px] bg-sky-400/80 shadow-[0_0_0_1px_rgba(56,189,248,0.5)]"
            style={{ transform: 'translateX(0px)' }}
          />
        </div>
      )}
      <div style={{ width: `${leftWidth}%` }} className="h-full overflow-auto">
        {leftPanel}
      </div>
      <div
        onMouseDown={handleMouseDown}
        ref={dividerRef}
        className={`w-2 h-full bg-slate-700 hover:bg-sky-600 cursor-col-resize flex-shrink-0 ${isResizing ? 'bg-sky-600' : ''}`}
        title="Resize panels"
      />
      <div style={{ width: `${100 - leftWidth}%` }} className="h-full overflow-auto">
        {rightPanel}
      </div>
    </div>
  );
};

export default ResizablePanels;
    
