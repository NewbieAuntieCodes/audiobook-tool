import { useCallback, useMemo, useRef, useState } from 'react';
import { ArrowDownTrayIcon, ArrowsRightLeftIcon, UploadIcon } from '../../../components/ui/icons';
import { cn } from '../../../utils/cn';
import {
  extractChapterNumberFromFilename,
  getElectronFilePath,
  removeFileByIdentity,
  toDisplayFiles,
} from '../lib/toolFiles';
import ToolSection from './ToolSection';

const CuePointWriterPanel = () => {
  const canWriteCuePoints =
    typeof window !== 'undefined' && !!window.electronAPI?.writeAuditionCuePoints;
  const [cueMp3Files, setCueMp3Files] = useState<File[]>([]);
  const [cueTranscriptFiles, setCueTranscriptFiles] = useState<File[]>([]);
  const [isWritingCuePoints, setIsWritingCuePoints] = useState(false);
  const [cueMsg, setCueMsg] = useState<string | null>(null);
  const cueMp3InputRef = useRef<HTMLInputElement>(null);
  const cueTranscriptInputRef = useRef<HTMLInputElement>(null);

  const cueMp3List = useMemo(() => toDisplayFiles(cueMp3Files), [cueMp3Files]);
  const cueTranscriptList = useMemo(
    () => toDisplayFiles(cueTranscriptFiles),
    [cueTranscriptFiles]
  );

  const handleCueMp3Files = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const mp3Files = Array.from(files).filter((file) =>
      file.name.toLowerCase().endsWith('.mp3')
    );
    if (mp3Files.length === 0) {
      alert('请选择 .mp3 文件。');
      return;
    }
    setCueMp3Files(mp3Files);
  }, []);

  const handleCueTranscriptFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const documents = Array.from(files).filter((file) => /\.(docx|txt)$/i.test(file.name));
    if (documents.length === 0) {
      alert('请选择带时间戳的转写文档（.docx / .txt）。');
      return;
    }
    setCueTranscriptFiles(documents);
  }, []);

  const handleWriteCuePoints = useCallback(async () => {
    if (!canWriteCuePoints) {
      alert('当前为浏览器模式，需在 Electron 中使用“写入转写文档标记到 MP3”。');
      return;
    }
    if (cueMp3Files.length === 0 || cueTranscriptFiles.length === 0) {
      alert('请先选择 MP3 文件与转写文档（.docx/.txt）。支持批量：两侧都可多选。');
      return;
    }

    const audioPaths = cueMp3Files.map(getElectronFilePath).filter(Boolean) as string[];
    const transcriptPaths = cueTranscriptFiles
      .map(getElectronFilePath)
      .filter(Boolean) as string[];
    if (
      audioPaths.length !== cueMp3Files.length ||
      transcriptPaths.length !== cueTranscriptFiles.length
    ) {
      alert('未获取到文件路径，请在 Electron 环境中操作。');
      return;
    }

    setIsWritingCuePoints(true);
    setCueMsg(null);
    try {
      if (cueMp3Files.length === 1 && cueTranscriptFiles.length === 1) {
        const result = await window.electronAPI!.writeAuditionCuePoints!({
          audioPath: audioPaths[0],
          transcriptPath: transcriptPaths[0],
          overwrite: true,
        });
        if (!result.success) {
          const message = result.error || '写入失败';
          setCueMsg(message);
          alert(message);
          return;
        }

        const message = [
          '写入完成',
          `输出文件：${result.outputPath}`,
          `标记数：${result.markerCount ?? '-'}`,
          `采样率：${result.sampleRate ?? '-'}`,
        ].join('\n');
        setCueMsg(message);
        alert(message);
        return;
      }

      const mp3ByChapter = new Map<number, File[]>();
      const docByChapter = new Map<number, File[]>();
      const mp3NoChapter: File[] = [];
      const docNoChapter: File[] = [];

      for (const file of cueMp3Files) {
        const chapterNumber = extractChapterNumberFromFilename(file.name);
        if (!Number.isFinite(chapterNumber)) {
          mp3NoChapter.push(file);
          continue;
        }
        const groupedFiles = mp3ByChapter.get(chapterNumber!) || [];
        groupedFiles.push(file);
        mp3ByChapter.set(chapterNumber!, groupedFiles);
      }

      for (const file of cueTranscriptFiles) {
        const chapterNumber = extractChapterNumberFromFilename(file.name);
        if (!Number.isFinite(chapterNumber)) {
          docNoChapter.push(file);
          continue;
        }
        const groupedFiles = docByChapter.get(chapterNumber!) || [];
        groupedFiles.push(file);
        docByChapter.set(chapterNumber!, groupedFiles);
      }

      const allChapters = Array.from(
        new Set<number>([...mp3ByChapter.keys(), ...docByChapter.keys()])
      ).sort((a, b) => a - b);
      const pairs: Array<{ chapter: number; mp3: File; doc: File }> = [];
      const conflicts: Array<{ chapter: number; mp3Count: number; docCount: number }> = [];
      const missingMp3: number[] = [];
      const missingDoc: number[] = [];

      for (const chapterNumber of allChapters) {
        const mp3s = mp3ByChapter.get(chapterNumber) || [];
        const docs = docByChapter.get(chapterNumber) || [];
        if (mp3s.length === 1 && docs.length === 1) {
          pairs.push({ chapter: chapterNumber, mp3: mp3s[0], doc: docs[0] });
        } else if (mp3s.length === 0 && docs.length > 0) {
          missingMp3.push(chapterNumber);
        } else if (docs.length === 0 && mp3s.length > 0) {
          missingDoc.push(chapterNumber);
        } else {
          conflicts.push({
            chapter: chapterNumber,
            mp3Count: mp3s.length,
            docCount: docs.length,
          });
        }
      }

      if (pairs.length === 0) {
        const message = [
          '未找到可写入的配对（批量）',
          `MP3：${cueMp3Files.length} 个，文档：${cueTranscriptFiles.length} 个`,
          missingMp3.length > 0 ? `缺 MP3：${missingMp3.join(', ')}` : null,
          missingDoc.length > 0 ? `缺文档：${missingDoc.join(', ')}` : null,
          conflicts.length > 0
            ? `章节冲突（同章多文件）：${conflicts
                .map(
                  (item) => `${item.chapter}(mp3=${item.mp3Count},doc=${item.docCount})`
                )
                .join('，')}`
            : null,
          mp3NoChapter.length > 0
            ? `无法识别章节号的 MP3：${mp3NoChapter
                .map((file) => file.name)
                .slice(0, 5)
                .join('，')}${mp3NoChapter.length > 5 ? '…' : ''}`
            : null,
          docNoChapter.length > 0
            ? `无法识别章节号的文档：${docNoChapter
                .map((file) => file.name)
                .slice(0, 5)
                .join('，')}${docNoChapter.length > 5 ? '…' : ''}`
            : null,
          '建议：确保 MP3 与文档文件名都含同一章节号（例如 012 / 第12集）。',
        ]
          .filter(Boolean)
          .join('\n');
        setCueMsg(message);
        alert(message);
        return;
      }

      const succeeded: Array<{ chapter: number; name: string }> = [];
      const failed: Array<{ chapter: number; name: string; error: string }> = [];

      for (let index = 0; index < pairs.length; index += 1) {
        const pair = pairs[index];
        setCueMsg(`写入中… ${index + 1}/${pairs.length}（第${pair.chapter}）\n${pair.mp3.name}`);

        const audioPath = getElectronFilePath(pair.mp3);
        const transcriptPath = getElectronFilePath(pair.doc);
        if (!audioPath || !transcriptPath) {
          failed.push({
            chapter: pair.chapter,
            name: pair.mp3.name,
            error: '未获取到文件路径（请在 Electron 中操作）',
          });
          continue;
        }

        const result = await window.electronAPI!.writeAuditionCuePoints!({
          audioPath,
          transcriptPath,
          overwrite: true,
        });
        if (!result.success) {
          failed.push({
            chapter: pair.chapter,
            name: pair.mp3.name,
            error: result.error || '写入失败',
          });
          continue;
        }

        succeeded.push({ chapter: pair.chapter, name: pair.mp3.name });
      }

      const messageLines: string[] = [];
      messageLines.push('批量写入完成');
      messageLines.push(`成功：${succeeded.length} / ${pairs.length}`);
      if (failed.length > 0) {
        messageLines.push(`失败：${failed.length}`);
        messageLines.push(
          ...failed
            .slice(0, 8)
            .map((item) => `- 第${item.chapter} ${item.name}: ${item.error}`)
        );
        if (failed.length > 8) {
          messageLines.push('（更多失败条目已省略）');
        }
      }
      if (missingMp3.length > 0) {
        messageLines.push(`缺 MP3 的章节：${missingMp3.join(', ')}`);
      }
      if (missingDoc.length > 0) {
        messageLines.push(`缺文档的章节：${missingDoc.join(', ')}`);
      }
      if (conflicts.length > 0) {
        messageLines.push(
          `章节冲突（同章多文件，已跳过）：${conflicts
            .map((item) => `${item.chapter}(mp3=${item.mp3Count},doc=${item.docCount})`)
            .join('，')}`
        );
      }
      if (mp3NoChapter.length > 0) {
        messageLines.push(
          `无法识别章节号的 MP3（已跳过）：${mp3NoChapter
            .map((file) => file.name)
            .slice(0, 5)
            .join('，')}${mp3NoChapter.length > 5 ? '…' : ''}`
        );
      }
      if (docNoChapter.length > 0) {
        messageLines.push(
          `无法识别章节号的文档（已跳过）：${docNoChapter
            .map((file) => file.name)
            .slice(0, 5)
            .join('，')}${docNoChapter.length > 5 ? '…' : ''}`
        );
      }

      const message = messageLines.join('\n');
      setCueMsg(message);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setCueMsg(message);
      alert(message);
    } finally {
      setIsWritingCuePoints(false);
    }
  }, [canWriteCuePoints, cueMp3Files, cueTranscriptFiles]);

  return (
    <ToolSection
      title="转写文档 → Audition 标记写入"
      description="根据带时间戳的 .docx/.txt，把每行时间直接写入原 MP3 的 Audition CuePoint（XMP），支持按章节号自动配对。"
      iconClassName="bg-fuchsia-900/40 border-fuchsia-600/40 text-fuchsia-200"
      actions={
        <button
          onClick={handleWriteCuePoints}
          disabled={
            !canWriteCuePoints ||
            isWritingCuePoints ||
            cueMp3Files.length === 0 ||
            cueTranscriptFiles.length === 0
          }
          className={cn(
            'px-3 py-1.5 rounded-md text-xs border transition',
            !canWriteCuePoints ||
              isWritingCuePoints ||
              cueMp3Files.length === 0 ||
              cueTranscriptFiles.length === 0
              ? 'bg-slate-700 text-slate-500 border-slate-600 cursor-not-allowed'
              : 'bg-fuchsia-700 hover:bg-fuchsia-600 text-white border-fuchsia-500'
          )}
          title={canWriteCuePoints ? '写入 Audition 标记（Electron）' : '需在 Electron 中使用'}
        >
          {isWritingCuePoints ? '写入中…' : '写入标记'}
        </button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <div
          className={cn(
            'bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col gap-3 transition',
            cueMp3Files.length > 0 ? 'border-fuchsia-600/60' : ''
          )}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            handleCueMp3Files(event.dataTransfer.files);
          }}
        >
          <div className="flex items-center justify-between text-sm text-slate-200">
            <span>目标 MP3（待写入标记）</span>
            <button
              onClick={() => cueMp3InputRef.current?.click()}
              className="text-xs text-sky-300 hover:text-sky-100"
            >
              选择文件
            </button>
          </div>
          <div className="flex flex-col flex-grow gap-2">
            <div className="border-2 border-dashed border-slate-600 rounded-lg p-4 text-center text-slate-300 bg-slate-900/60">
              <UploadIcon className="w-6 h-6 mx-auto text-fuchsia-300" />
              <p className="mt-2 text-sm">将 MP3 拖到这里</p>
              <p className="text-xs text-slate-500">会直接覆盖写入原文件（建议先自行备份）</p>
              {!canWriteCuePoints && (
                <p className="text-[11px] text-amber-300 mt-2">需在 Electron 中使用</p>
              )}
            </div>
            <div className="text-xs text-slate-400">
              {cueMp3List.length === 0 ? (
                <span>已选：无</span>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span>已选 {cueMp3List.length} 个</span>
                    <button
                      className="text-xs text-slate-400 hover:text-slate-200"
                      onClick={() => setCueMp3Files([])}
                      title="清空"
                    >
                      清空
                    </button>
                  </div>
                  <div className="mt-1 space-y-1 max-h-36 overflow-y-auto">
                    {cueMp3List.map((file) => (
                      <div
                        key={`${file.name}-${file.path || ''}`}
                        className="flex items-center justify-between bg-slate-750/80 rounded px-2 py-1"
                      >
                        <span className="truncate" title={file.path || file.name}>
                          {file.name}
                        </span>
                        <button
                          className="text-xs text-slate-400 hover:text-slate-200"
                          onClick={() =>
                            setCueMp3Files((prevFiles) =>
                              removeFileByIdentity(prevFiles, file)
                            )
                          }
                          title="移除"
                        >
                          ×
                        </button>
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
            <ArrowsRightLeftIcon className="w-8 h-8 text-fuchsia-300 rotate-90" />
            <div className="text-sm">写入 MP3 标记（按章节号配对）</div>
            {!canWriteCuePoints && (
              <div className="text-[11px] text-amber-300">需在 Electron 中使用</div>
            )}
          </div>
        </div>

        <div
          className={cn(
            'bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col gap-3 transition',
            cueTranscriptFiles.length > 0 ? 'border-emerald-600/60' : ''
          )}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            handleCueTranscriptFiles(event.dataTransfer.files);
          }}
        >
          <div className="flex items-center justify-between text-sm text-slate-200">
            <span>转写文档（带时间戳）</span>
            <button
              onClick={() => cueTranscriptInputRef.current?.click()}
              className="text-xs text-sky-300 hover:text-sky-100"
            >
              选择文件
            </button>
          </div>
          <div className="flex flex-col flex-grow gap-2">
            <div className="border-2 border-dashed border-slate-600 rounded-lg p-4 text-center text-slate-300 bg-slate-900/60">
              <ArrowDownTrayIcon className="w-6 h-6 mx-auto text-emerald-300" />
              <p className="mt-2 text-sm">将 .docx/.txt 拖到这里</p>
              <p className="text-xs text-slate-500">格式示例：00:00:01 你好吗</p>
            </div>
            <div className="text-xs text-slate-400">
              {cueTranscriptList.length === 0 ? (
                <span>已选：无</span>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span>已选 {cueTranscriptList.length} 个</span>
                    <button
                      className="text-xs text-slate-400 hover:text-slate-200"
                      onClick={() => setCueTranscriptFiles([])}
                      title="清空"
                    >
                      清空
                    </button>
                  </div>
                  <div className="mt-1 space-y-1 max-h-36 overflow-y-auto">
                    {cueTranscriptList.map((file) => (
                      <div
                        key={`${file.name}-${file.path || ''}`}
                        className="flex items-center justify-between bg-slate-750/80 rounded px-2 py-1"
                      >
                        <span className="truncate" title={file.path || file.name}>
                          {file.name}
                        </span>
                        <button
                          className="text-xs text-slate-400 hover:text-slate-200"
                          onClick={() =>
                            setCueTranscriptFiles((prevFiles) =>
                              removeFileByIdentity(prevFiles, file)
                            )
                          }
                          title="移除"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {cueMsg && (
        <div className="mt-3 text-sm text-slate-200 bg-slate-800/80 border border-slate-700 rounded-lg p-3 whitespace-pre-wrap">
          {cueMsg}
        </div>
      )}

      <input
        ref={cueMp3InputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => handleCueMp3Files(event.target.files)}
        accept=".mp3"
      />
      <input
        ref={cueTranscriptInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => handleCueTranscriptFiles(event.target.files)}
        accept=".docx,.txt"
      />
    </ToolSection>
  );
};

export default CuePointWriterPanel;
