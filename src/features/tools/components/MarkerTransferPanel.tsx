import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ArrowDownTrayIcon,
  ArrowsRightLeftIcon,
  UploadIcon,
} from '../../../components/ui/icons';
import { cn } from '../../../utils/cn';
import {
  getElectronFilePath,
  toDisplayFiles,
} from '../lib/toolFiles';
import ToolSection from './ToolSection';

const MarkerTransferPanel = () => {
  const isElectron =
    typeof window !== 'undefined' && !!window.electronAPI?.transferMarkers;
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [targetFiles, setTargetFiles] = useState<File[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);

  const sourceList = useMemo(() => toDisplayFiles(sourceFiles), [sourceFiles]);
  const targetList = useMemo(() => toDisplayFiles(targetFiles), [targetFiles]);

  const handleFiles = useCallback((files: FileList | null, kind: 'source' | 'target') => {
    if (!files || files.length === 0) return;
    const nextFiles = Array.from(files);
    if (kind === 'source') {
      setSourceFiles(nextFiles);
      return;
    }
    setTargetFiles(nextFiles);
  }, []);

  const handleTransfer = useCallback(async () => {
    if (!isElectron) {
      alert('当前为浏览器模式，需在 Electron 中使用标记迁移。');
      return;
    }
    if (sourceFiles.length === 0 || targetFiles.length === 0) {
      alert('请先拖入源音频和目标音频。');
      return;
    }

    const sources = sourceFiles.map(getElectronFilePath).filter(Boolean) as string[];
    const targets = targetFiles.map(getElectronFilePath).filter(Boolean) as string[];
    if (sources.length === 0 || targets.length === 0) {
      alert('未获取到文件路径，请在 Electron 环境中操作。');
      return;
    }

    setIsTransferring(true);
    setResultMsg(null);
    try {
      const result = await window.electronAPI!.transferMarkers!({
        sources,
        targets,
        outputDir: null,
        overwrite: true,
      });
      if (!result.success) {
        const message = result.error || '迁移失败';
        setResultMsg(message);
        alert(message);
        return;
      }

      const okCount = result.results.filter((item) => item.ok).length;
      const failedResults = result.results.filter((item) => !item.ok);
      const message = [
        `迁移完成：成功 ${okCount} / ${result.results.length}`,
        ...failedResults
          .slice(0, 5)
          .map((item) => `失败: ${item.target || item.source} (${item.error || '未知'})`),
      ].join('\n');
      setResultMsg(message);
      alert(message);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setResultMsg(message);
      alert(`迁移失败: ${message}`);
    } finally {
      setIsTransferring(false);
    }
  }, [isElectron, sourceFiles, targetFiles]);

  return (
    <ToolSection
      title="Audition 标记跨音频迁移"
      description="拖入源音频（已含标记）和目标音频，后续由 Electron 执行标记复制。"
      iconClassName="bg-sky-900/60 border-sky-600/50 text-sky-200"
      actions={
        <span className="text-xs px-2 py-1 rounded-full bg-sky-800/70 text-sky-100 border border-sky-600/60">
          UI 就绪 · 功能待接入
        </span>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <div
          className={cn(
            'bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col gap-3 transition',
            sourceFiles.length > 0 ? 'border-sky-600/70' : ''
          )}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            handleFiles(event.dataTransfer.files, 'source');
          }}
        >
          <div className="flex items-center justify-between text-sm text-slate-200">
            <span>源音频（含标记）</span>
            <button
              onClick={() => sourceInputRef.current?.click()}
              className="text-xs text-sky-300 hover:text-sky-100"
            >
              选择文件
            </button>
          </div>
          <div className="flex flex-col flex-grow gap-2">
            <div className="border-2 border-dashed border-slate-600 rounded-lg p-4 text-center text-slate-300 bg-slate-900/60">
              <UploadIcon className="w-6 h-6 mx-auto text-sky-300" />
              <p className="mt-2 text-sm">将含 Audition 标记的音频拖到这里</p>
              <p className="text-xs text-slate-500">示例：第001集 xxx.mp3</p>
            </div>
            <div className="text-xs text-slate-400">
              {sourceList.length === 0 ? (
                <span>已选：无</span>
              ) : (
                <>
                  <span>已选 {sourceList.length} 个</span>
                  <div className="mt-1 space-y-1 max-h-28 overflow-y-auto">
                    {sourceList.map((file) => (
                      <div
                        key={`${file.name}-${file.path || ''}`}
                        className="flex items-center justify-between bg-slate-750/80 rounded px-2 py-1"
                      >
                        <span className="truncate" title={file.path || file.name}>
                          {file.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="hidden lg:flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-slate-300">
            <ArrowsRightLeftIcon className="w-8 h-8 text-sky-300" />
            <div className="text-sm">将标记批量迁移到右侧音频</div>
            <button
              onClick={handleTransfer}
              disabled={
                isTransferring ||
                sourceFiles.length === 0 ||
                targetFiles.length === 0 ||
                !isElectron
              }
              className={cn(
                'px-3 py-1.5 rounded-md text-xs border transition',
                isTransferring ||
                  sourceFiles.length === 0 ||
                  targetFiles.length === 0 ||
                  !isElectron
                  ? 'bg-slate-700 text-slate-500 border-slate-600 cursor-not-allowed'
                  : 'bg-sky-700 hover:bg-sky-600 text-white border-sky-500'
              )}
              title={isElectron ? '执行标记迁移（Electron）' : '需在 Electron 中使用'}
            >
              {isTransferring ? '迁移中…' : '开始迁移'}
            </button>
            {!isElectron && (
              <div className="text-[11px] text-amber-300">需在 Electron 中使用</div>
            )}
          </div>
        </div>

        <div
          className={cn(
            'bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col gap-3 transition',
            targetFiles.length > 0 ? 'border-emerald-600/70' : ''
          )}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            handleFiles(event.dataTransfer.files, 'target');
          }}
        >
          <div className="flex items-center justify-between text-sm text-slate-200">
            <span>目标音频（待写入标记）</span>
            <button
              onClick={() => targetInputRef.current?.click()}
              className="text-xs text-sky-300 hover:text-sky-100"
            >
              选择文件
            </button>
          </div>
          <div className="flex flex-col flex-grow gap-2">
            <div className="border-2 border-dashed border-slate-600 rounded-lg p-4 text-center text-slate-300 bg-slate-900/60">
              <ArrowDownTrayIcon className="w-6 h-6 mx-auto text-emerald-300" />
              <p className="mt-2 text-sm">将需写入标记的音频拖到这里</p>
              <p className="text-xs text-slate-500">示例：第001集 xxx_Vocals.mp3</p>
            </div>
            <div className="text-xs text-slate-400">
              {targetList.length === 0 ? (
                <span>已选：无</span>
              ) : (
                <>
                  <span>已选 {targetList.length} 个</span>
                  <div className="mt-1 space-y-1 max-h-28 overflow-y-auto">
                    {targetList.map((file) => (
                      <div
                        key={`${file.name}-${file.path || ''}`}
                        className="flex items-center justify-between bg-slate-750/80 rounded px-2 py-1"
                      >
                        <span className="truncate" title={file.path || file.name}>
                          {file.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {resultMsg && (
        <div className="mt-3 text-sm text-slate-200 bg-slate-800/80 border border-slate-700 rounded-lg p-3 whitespace-pre-wrap">
          {resultMsg}
        </div>
      )}

      <input
        ref={sourceInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => handleFiles(event.target.files, 'source')}
        accept=".mp3,.wav,.flac,.m4a,.aac,.ogg,.wma"
      />
      <input
        ref={targetInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => handleFiles(event.target.files, 'target')}
        accept=".mp3,.wav,.flac,.m4a,.aac,.ogg,.wma"
      />
    </ToolSection>
  );
};

export default MarkerTransferPanel;
