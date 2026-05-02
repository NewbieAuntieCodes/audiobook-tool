import React, { useCallback, useEffect, useState } from 'react';
import {
  clearLocalCodexPerfEntries,
  formatLocalCodexPerfEntriesForClipboard,
  getLocalCodexPerfEntries,
  subscribeLocalCodexPerfEntries,
  type LocalCodexPerfEntry,
} from '../../../../lib/localCodexPerfDebug';

const LocalCodexPerfDebugPanel: React.FC = () => {
  const [entries, setEntries] = useState<LocalCodexPerfEntry[]>(() =>
    getLocalCodexPerfEntries()
  );
  const [isOpen, setIsOpen] = useState(true);
  const hasEntries = entries.length > 0;

  useEffect(() => {
    return subscribeLocalCodexPerfEntries((nextEntries) => {
      setEntries(nextEntries);
      if (nextEntries.length > 0) {
        setIsOpen(true);
      }
    });
  }, []);

  const handleCopy = useCallback(async () => {
    const text = formatLocalCodexPerfEntriesForClipboard(entries);
    if (!text.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      alert('本地 Codex 调试日志已复制，可以直接发给我。');
    } catch (error) {
      console.error('Copy local Codex perf logs failed:', error);
      alert('复制失败，请直接选中文本后复制给我。');
    }
  }, [entries]);

  const handleClear = useCallback(() => {
    clearLocalCodexPerfEntries();
  }, []);

  if (!hasEntries) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[90] w-[440px] max-w-[calc(100vw-2rem)] rounded-lg border border-amber-500/50 bg-slate-900/95 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between gap-2 border-b border-slate-700 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-300">本地 Codex 调试日志</p>
          <p className="text-[11px] text-slate-400">
            复现卡顿后，点“复制文本”把内容发给我
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsOpen((prev) => !prev)}
            className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-100 hover:bg-slate-600"
          >
            {isOpen ? '收起' : '展开'}
          </button>
          <button
            onClick={handleClear}
            className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-100 hover:bg-slate-600"
          >
            清空
          </button>
          <button
            onClick={() => {
              void handleCopy();
            }}
            className="rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-500"
          >
            复制文本
          </button>
        </div>
      </div>
      {isOpen && (
        <textarea
          readOnly
          value={formatLocalCodexPerfEntriesForClipboard(entries)}
          className="h-64 w-full resize-y bg-slate-950 px-3 py-2 font-mono text-[11px] leading-5 text-slate-100 outline-none"
          aria-label="本地 Codex 调试日志"
        />
      )}
    </div>
  );
};

export default LocalCodexPerfDebugPanel;
