import { useCallback, useRef, useState } from 'react';
import { UploadIcon } from '../../../components/ui/icons';
import { cn } from '../../../utils/cn';
import ToolSection from './ToolSection';

const M4aConverterPanel = () => {
  const canConvertM4a =
    typeof window !== 'undefined' && !!window.electronAPI?.convertM4aToMp3;
  const [m4aFiles, setM4aFiles] = useState<File[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [convertMsg, setConvertMsg] = useState<string | null>(null);
  const m4aInputRef = useRef<HTMLInputElement>(null);

  const handleM4aFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selectedFiles = Array.from(files).filter((file) =>
      file.name.toLowerCase().endsWith('.m4a')
    );
    setM4aFiles(selectedFiles);
  }, []);

  const handleConvert = useCallback(async () => {
    if (!canConvertM4a) {
      alert('当前为浏览器模式，需在 Electron 中使用批量转码。');
      return;
    }
    if (m4aFiles.length === 0) {
      alert('请先拖入或选择 .m4a 文件。');
      return;
    }

    const paths = m4aFiles
      .map((file) => (file as File & { path?: string }).path)
      .filter(Boolean) as string[];
    if (paths.length === 0) {
      alert('未获取到文件路径，请在 Electron 环境中操作。');
      return;
    }

    setIsConverting(true);
    setConvertMsg(null);
    try {
      const result = await window.electronAPI!.convertM4aToMp3!({
        files: paths,
        bitrateKbps: 320,
        overwrite: true,
      });

      const okCount = result.results.filter((item) => item.ok).length;
      const failedResults = result.results.filter((item) => !item.ok);
      const messageLines = [
        `转换完成：成功 ${okCount} 个，失败 ${failedResults.length} 个。`,
        failedResults.length > 0
          ? `失败列表：\n${failedResults
              .map((item) => `- ${item.input}: ${item.error || '未知错误'}`)
              .join('\n')}`
          : '',
      ].filter(Boolean);

      setConvertMsg(messageLines.join('\n'));
      if (!result.success) {
        alert(result.error || '部分文件转换失败');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setConvertMsg(message);
      alert(message);
    } finally {
      setIsConverting(false);
    }
  }, [canConvertM4a, m4aFiles]);

  return (
    <ToolSection
      title="批量 m4a → mp3"
      description="320k · 输出原目录 · 覆盖同名 mp3 · 保留元数据（需在 Electron 中使用）。"
      iconClassName="bg-emerald-900/50 border-emerald-600/50 text-emerald-200"
      actions={
        <button
          onClick={handleConvert}
          disabled={!canConvertM4a || isConverting || m4aFiles.length === 0}
          className={cn(
            'px-3 py-1.5 rounded-md text-xs border transition',
            !canConvertM4a || isConverting || m4aFiles.length === 0
              ? 'bg-slate-700 text-slate-500 border-slate-600 cursor-not-allowed'
              : 'bg-emerald-700 hover:bg-emerald-600 text-white border-emerald-500'
          )}
          title={canConvertM4a ? '开始转换（Electron）' : '需在 Electron 中使用'}
        >
          {isConverting ? '转换中…' : '开始转换'}
        </button>
      }
    >
      <div
        className={cn(
          'bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col gap-3 transition',
          m4aFiles.length > 0 ? 'border-emerald-600/70' : ''
        )}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          handleM4aFiles(event.dataTransfer.files);
        }}
      >
        <div className="flex items-center justify-between text-sm text-slate-200">
          <span>m4a 文件</span>
          <button
            onClick={() => m4aInputRef.current?.click()}
            className="text-xs text-sky-300 hover:text-sky-100"
          >
            选择文件
          </button>
        </div>
        <div className="flex flex-col flex-grow gap-2">
          <div className="border-2 border-dashed border-slate-600 rounded-lg p-4 text-center text-slate-300 bg-slate-900/60">
            <UploadIcon className="w-6 h-6 mx-auto text-sky-300" />
            <p className="mt-2 text-sm">将 m4a 文件拖到这里</p>
            <p className="text-xs text-slate-500">会在原目录生成同名 mp3（覆盖同名）</p>
            {!canConvertM4a && (
              <p className="text-[11px] text-amber-300 mt-2">需在 Electron 中使用</p>
            )}
          </div>
          <div className="text-xs text-slate-400">
            {m4aFiles.length === 0 ? (
              <span>已选：无</span>
            ) : (
              <>
                <span>已选 {m4aFiles.length} 个</span>
                <div className="mt-1 space-y-1 max-h-36 overflow-y-auto">
                  {m4aFiles.map((file) => {
                    const path = (file as File & { path?: string }).path;
                    return (
                      <div
                        key={`${file.name}-${path || ''}`}
                        className="flex items-center justify-between bg-slate-750/80 rounded px-2 py-1"
                      >
                        <span className="truncate" title={path || file.name}>
                          {file.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {convertMsg && (
        <div className="mt-3 text-sm text-slate-200 bg-slate-800/80 border border-slate-700 rounded-lg p-3 whitespace-pre-wrap">
          {convertMsg}
        </div>
      )}

      <input
        ref={m4aInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => handleM4aFiles(event.target.files)}
        accept=".m4a"
      />
    </ToolSection>
  );
};

export default M4aConverterPanel;
