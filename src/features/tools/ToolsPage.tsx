import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import {
  ArrowLeftIcon,
  WrenchIcon,
  CloudArrowDownIcon,
  ArrowPathIcon,
  UploadIcon,
  ArrowsRightLeftIcon,
  ArrowDownTrayIcon,
} from '../../components/ui/icons';
import { cn } from '../../utils/cn';

const extractChapterNumberFromFilename = (filename: string): number | null => {
  const base = String(filename || '').replace(/\.[^.]+$/, '');
  const mChapter = base.match(/第\s*0*(\d{1,5})\s*(?:集|章|回|话)/);
  if (mChapter?.[1]) {
    const n = parseInt(mChapter[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  const blocks = Array.from(base.matchAll(/\d+/g)).map((m) => m[0]);
  if (blocks.length === 0) return null;
  const preferred = blocks.find((b) => b.length <= 4);
  const chosen = preferred ?? blocks[0];
  const n = parseInt(chosen, 10);
  return Number.isFinite(n) ? n : null;
};

const ToolCard: React.FC<{
  title: string;
  desc: string;
  status?: 'ready' | 'wip';
  actions?: React.ReactNode;
  badge?: string;
}> = ({ title, desc, status = 'wip', actions, badge }) => {
  const statusLabel = status === 'ready' ? '可用' : '筹备中';
  const statusColor =
    status === 'ready'
      ? 'bg-emerald-600/30 text-emerald-200 border border-emerald-500/40'
      : 'bg-slate-700/60 text-slate-200 border border-slate-600';

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col gap-3 shadow-lg shadow-slate-900/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-sky-900/50 border border-sky-600/50 flex items-center justify-center text-sky-200">
            <WrenchIcon className="w-4 h-4" />
          </div>
          <div className="text-lg font-semibold text-slate-100">{title}</div>
          {badge && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-sky-700/60 text-sky-100 border border-sky-600/60">
              {badge}
            </span>
          )}
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${statusColor}`}>{statusLabel}</span>
      </div>
      <p className="text-sm text-slate-300 leading-relaxed">{desc}</p>
      {actions || (
        <div className="flex items-center gap-2">
          <button
            disabled
            className="px-3 py-1.5 text-sm rounded-md bg-slate-700 text-slate-400 border border-slate-600 cursor-not-allowed"
            title="功能将在 Electron 端实现"
          >
            敬请期待
          </button>
          <span className="text-xs text-slate-500">具体功能将在 Electron 中完成</span>
        </div>
      )}
    </div>
  );
};

const ToolsPage: React.FC = () => {
  const { navigateTo } = useStore((s) => ({ navigateTo: s.navigateTo }));
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [targetFiles, setTargetFiles] = useState<File[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.transferMarkers;
  const canConvertM4a = typeof window !== 'undefined' && !!window.electronAPI?.convertM4aToMp3;
  const canWriteCuePoints = typeof window !== 'undefined' && !!window.electronAPI?.writeAuditionCuePoints;
  const canCleanTranscript = typeof window !== 'undefined' && !!window.electronAPI?.cleanTranscriptText;

  const [transcriptInput, setTranscriptInput] = useState('');
  const [transcriptOutput, setTranscriptOutput] = useState('');
  const [isCleaningTranscript, setIsCleaningTranscript] = useState(false);
  const [transcriptMsg, setTranscriptMsg] = useState<string | null>(null);

  const [m4aFiles, setM4aFiles] = useState<File[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [convertMsg, setConvertMsg] = useState<string | null>(null);
  const m4aInputRef = useRef<HTMLInputElement>(null);

  const [cueMp3Files, setCueMp3Files] = useState<File[]>([]);
  const [cueTranscriptFiles, setCueTranscriptFiles] = useState<File[]>([]);
  const [isWritingCuePoints, setIsWritingCuePoints] = useState(false);
  const [cueMsg, setCueMsg] = useState<string | null>(null);
  const cueMp3InputRef = useRef<HTMLInputElement>(null);
  const cueTranscriptInputRef = useRef<HTMLInputElement>(null);

  const handlePasteTranscript = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setTranscriptInput(text || '');
      setTranscriptMsg(null);
    } catch (e: any) {
      const msg = e?.message || String(e);
      setTranscriptMsg(`读取剪贴板失败：${msg}`);
    }
  }, []);

  const handleCopyTranscriptOutput = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(transcriptOutput || '');
      setTranscriptMsg('已复制到剪贴板');
    } catch (e: any) {
      const msg = e?.message || String(e);
      setTranscriptMsg(`复制失败：${msg}`);
    }
  }, [transcriptOutput]);

  const handleCleanTranscript = useCallback(async () => {
    const input = transcriptInput || '';
    if (!input.trim()) {
      setTranscriptMsg('请先粘贴/输入文本');
      return;
    }

    if (!window.electronAPI?.cleanTranscriptText) {
      setTranscriptMsg('当前环境不可用：需在 Electron 中使用');
      return;
    }

    setIsCleaningTranscript(true);
    setTranscriptMsg(null);
    try {
      const res = await window.electronAPI.cleanTranscriptText({ text: input, removeEmptyLines: true });
      if (!res.success) throw new Error(res.error || '清洗失败');
      setTranscriptOutput(res.text || '');
      setTranscriptMsg('清洗完成');
    } catch (e: any) {
      const msg = e?.message || String(e);
      setTranscriptMsg(msg);
    } finally {
      setIsCleaningTranscript(false);
    }
  }, [transcriptInput]);

  const sourceList = useMemo(
    () => sourceFiles.map((f) => ({ name: f.name, path: (f as any).path, count: '?' })),
    [sourceFiles]
  );
  const targetList = useMemo(
    () => targetFiles.map((f) => ({ name: f.name, path: (f as any).path })),
    [targetFiles]
  );
  const cueMp3List = useMemo(() => cueMp3Files.map((f) => ({ name: f.name, path: (f as any).path })), [cueMp3Files]);
  const cueTranscriptList = useMemo(
    () => cueTranscriptFiles.map((f) => ({ name: f.name, path: (f as any).path })),
    [cueTranscriptFiles]
  );

  const handleFiles = useCallback((files: FileList | null, kind: 'source' | 'target') => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    if (kind === 'source') setSourceFiles(arr);
    else setTargetFiles(arr);
  }, []);

  const handleM4aFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files).filter((f) => (f.name || '').toLowerCase().endsWith('.m4a'));
    setM4aFiles(arr);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, kind: 'source' | 'target') => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      handleFiles(files, kind);
    },
    [handleFiles]
  );

  const handleBrowse = useCallback(
    (kind: 'source' | 'target') => {
      const ref = kind === 'source' ? sourceInputRef : targetInputRef;
      ref.current?.click();
    },
    []
  );

  const handleBrowseM4a = useCallback(() => {
    m4aInputRef.current?.click();
  }, []);

  const handleCueMp3Files = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const mp3s = Array.from(files).filter((f) => (f.name || '').toLowerCase().endsWith('.mp3'));
    if (mp3s.length === 0) {
      alert('请选择 .mp3 文件。');
      return;
    }
    setCueMp3Files(mp3s);
  }, []);

  const handleCueTranscriptFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const docs = Array.from(files).filter((f) => /\.(docx|txt)$/i.test(f.name || ''));
    if (docs.length === 0) {
      alert('请选择带时间戳的转写文档（.docx / .txt）。');
      return;
    }
    setCueTranscriptFiles(docs);
  }, []);

  const handleBrowseCueMp3 = useCallback(() => {
    cueMp3InputRef.current?.click();
  }, []);

  const handleBrowseCueTranscript = useCallback(() => {
    cueTranscriptInputRef.current?.click();
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

    const audioPaths = cueMp3Files.map((f: any) => f.path).filter(Boolean) as string[];
    const transcriptPaths = cueTranscriptFiles.map((f: any) => f.path).filter(Boolean) as string[];
    if (audioPaths.length !== cueMp3Files.length || transcriptPaths.length !== cueTranscriptFiles.length) {
      alert('未获取到文件路径，请在 Electron 环境中操作。');
      return;
    }

    setIsWritingCuePoints(true);
    setCueMsg(null);
    try {
      // 单文件：保持原体验
      if (cueMp3Files.length === 1 && cueTranscriptFiles.length === 1) {
        const res = await window.electronAPI!.writeAuditionCuePoints!({
          audioPath: audioPaths[0],
          transcriptPath: transcriptPaths[0],
          overwrite: true,
        });
        if (!res.success) {
          const msg = res.error || '写入失败';
          setCueMsg(msg);
          alert(msg);
          return;
        }

        const msgLines = [
          '写入完成',
          `输出文件：${res.outputPath}`,
          `标记数：${res.markerCount ?? '-'}`,
          `采样率：${res.sampleRate ?? '-'}`,
        ];
        const msg = msgLines.join('\n');
        setCueMsg(msg);
        alert(msg);
        return;
      }

      // 批量：按章节数字配对（文件名里第一个“章节号”数字）
      const mp3ByChapter = new Map<number, File[]>();
      const docByChapter = new Map<number, File[]>();
      const mp3NoChapter: File[] = [];
      const docNoChapter: File[] = [];

      for (const f of cueMp3Files) {
        const ch = extractChapterNumberFromFilename(f.name);
        if (!Number.isFinite(ch)) {
          mp3NoChapter.push(f);
          continue;
        }
        const arr = mp3ByChapter.get(ch!) || [];
        arr.push(f);
        mp3ByChapter.set(ch!, arr);
      }
      for (const f of cueTranscriptFiles) {
        const ch = extractChapterNumberFromFilename(f.name);
        if (!Number.isFinite(ch)) {
          docNoChapter.push(f);
          continue;
        }
        const arr = docByChapter.get(ch!) || [];
        arr.push(f);
        docByChapter.set(ch!, arr);
      }

      const allChapters = Array.from(new Set<number>([...mp3ByChapter.keys(), ...docByChapter.keys()])).sort((a, b) => a - b);
      const pairs: Array<{ chapter: number; mp3: File; doc: File }> = [];
      const conflicts: Array<{ chapter: number; mp3Count: number; docCount: number }> = [];
      const missingMp3: number[] = [];
      const missingDoc: number[] = [];

      for (const ch of allChapters) {
        const mp3s = mp3ByChapter.get(ch) || [];
        const docs = docByChapter.get(ch) || [];
        if (mp3s.length === 1 && docs.length === 1) {
          pairs.push({ chapter: ch, mp3: mp3s[0], doc: docs[0] });
        } else if (mp3s.length === 0 && docs.length > 0) {
          missingMp3.push(ch);
        } else if (docs.length === 0 && mp3s.length > 0) {
          missingDoc.push(ch);
        } else {
          conflicts.push({ chapter: ch, mp3Count: mp3s.length, docCount: docs.length });
        }
      }

      if (pairs.length === 0) {
        const msgLines = [
          '未找到可写入的配对（批量）',
          `MP3：${cueMp3Files.length} 个，文档：${cueTranscriptFiles.length} 个`,
          missingMp3.length > 0 ? `缺 MP3：${missingMp3.join(', ')}` : null,
          missingDoc.length > 0 ? `缺文档：${missingDoc.join(', ')}` : null,
          conflicts.length > 0 ? `章节冲突（同章多文件）：${conflicts.map((c) => `${c.chapter}(mp3=${c.mp3Count},doc=${c.docCount})`).join('，')}` : null,
          mp3NoChapter.length > 0 ? `无法识别章节号的 MP3：${mp3NoChapter.map((f) => f.name).slice(0, 5).join('，')}${mp3NoChapter.length > 5 ? '…' : ''}` : null,
          docNoChapter.length > 0 ? `无法识别章节号的文档：${docNoChapter.map((f) => f.name).slice(0, 5).join('，')}${docNoChapter.length > 5 ? '…' : ''}` : null,
          '建议：确保 MP3 与文档文件名都含同一章节号（例如 012 / 第12集）。',
        ].filter(Boolean) as string[];
        const msg = msgLines.join('\n');
        setCueMsg(msg);
        alert(msg);
        return;
      }

      const ok: Array<{ chapter: number; name: string }> = [];
      const fail: Array<{ chapter: number; name: string; error: string }> = [];

      for (let i = 0; i < pairs.length; i++) {
        const p = pairs[i];
        setCueMsg(`写入中… ${i + 1}/${pairs.length}（第${p.chapter}）\n${p.mp3.name}`);
        const audioPath = (p.mp3 as any).path as string | undefined;
        const transcriptPath = (p.doc as any).path as string | undefined;
        if (!audioPath || !transcriptPath) {
          fail.push({ chapter: p.chapter, name: p.mp3.name, error: '未获取到文件路径（请在 Electron 中操作）' });
          continue;
        }
        const res = await window.electronAPI!.writeAuditionCuePoints!({
          audioPath,
          transcriptPath,
          overwrite: true,
        });
        if (!res.success) {
          fail.push({ chapter: p.chapter, name: p.mp3.name, error: res.error || '写入失败' });
          continue;
        }
        ok.push({ chapter: p.chapter, name: p.mp3.name });
      }

      const msgLines: string[] = [];
      msgLines.push('批量写入完成');
      msgLines.push(`成功：${ok.length} / ${pairs.length}`);
      if (fail.length > 0) {
        msgLines.push(`失败：${fail.length}`);
        msgLines.push(...fail.slice(0, 8).map((f) => `- 第${f.chapter} ${f.name}: ${f.error}`));
        if (fail.length > 8) msgLines.push('（更多失败条目已省略）');
      }
      if (missingMp3.length > 0) msgLines.push(`缺 MP3 的章节：${missingMp3.join(', ')}`);
      if (missingDoc.length > 0) msgLines.push(`缺文档的章节：${missingDoc.join(', ')}`);
      if (conflicts.length > 0)
        msgLines.push(`章节冲突（同章多文件，已跳过）：${conflicts.map((c) => `${c.chapter}(mp3=${c.mp3Count},doc=${c.docCount})`).join('，')}`);
      if (mp3NoChapter.length > 0)
        msgLines.push(
          `无法识别章节号的 MP3（已跳过）：${mp3NoChapter.map((f) => f.name).slice(0, 5).join('，')}${mp3NoChapter.length > 5 ? '…' : ''}`
        );
      if (docNoChapter.length > 0)
        msgLines.push(
          `无法识别章节号的文档（已跳过）：${docNoChapter.map((f) => f.name).slice(0, 5).join('，')}${docNoChapter.length > 5 ? '…' : ''}`
        );

      const msg = msgLines.join('\n');
      setCueMsg(msg);
      alert(msg);
    } catch (e: any) {
      const msg = e?.message || String(e);
      setCueMsg(msg);
      alert(msg);
    } finally {
      setIsWritingCuePoints(false);
    }
  }, [canWriteCuePoints, cueMp3Files, cueTranscriptFiles]);

  const handleTransfer = useCallback(async () => {
    if (!isElectron) {
      alert('当前为浏览器模式，需在 Electron 中使用标记迁移。');
      return;
    }
    if (sourceFiles.length === 0 || targetFiles.length === 0) {
      alert('请先拖入源音频和目标音频。');
      return;
    }
    const sources = sourceFiles.map((f: any) => f.path).filter(Boolean);
    const targets = targetFiles.map((f: any) => f.path).filter(Boolean);
    if (sources.length === 0 || targets.length === 0) {
      alert('未获取到文件路径，请在 Electron 环境中操作。');
      return;
    }

    setIsTransferring(true);
    setResultMsg(null);
    try {
      const res = await window.electronAPI!.transferMarkers!({
        sources,
        targets,
        outputDir: null,
        overwrite: true,
      });
      if (!res.success) {
        setResultMsg(res.error || '迁移失败');
        alert(res.error || '迁移失败');
      } else {
        const okCount = res.results.filter((r) => r.ok).length;
        const fail = res.results.filter((r) => !r.ok);
        const msgLines = [
          `迁移完成：成功 ${okCount} / ${res.results.length}`,
          ...fail.slice(0, 5).map((f) => `失败: ${f.target || f.source} (${f.error || '未知'})`),
        ];
        setResultMsg(msgLines.join('\n'));
        alert(msgLines.join('\n'));
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      setResultMsg(msg);
      alert(`迁移失败: ${msg}`);
    } finally {
      setIsTransferring(false);
    }
  }, [isElectron, sourceFiles, targetFiles]);

  const handleConvert = useCallback(async () => {
    if (!canConvertM4a) {
      alert('当前为浏览器模式，需在 Electron 中使用批量转码。');
      return;
    }
    if (m4aFiles.length === 0) {
      alert('请先拖入或选择 .m4a 文件。');
      return;
    }

    const paths = m4aFiles.map((f: any) => f.path).filter(Boolean);
    if (paths.length === 0) {
      alert('未获取到文件路径，请在 Electron 环境中操作。');
      return;
    }

    setIsConverting(true);
    setConvertMsg(null);
    try {
      const res = await window.electronAPI!.convertM4aToMp3!({
        files: paths,
        bitrateKbps: 320,
        overwrite: true,
      });

      const okCount = res.results.filter((r) => r.ok).length;
      const fail = res.results.filter((r) => !r.ok);
      const msgLines = [
        `转换完成：成功 ${okCount} 个，失败 ${fail.length} 个。`,
        fail.length > 0 ? `失败列表：\n${fail.map((r) => `- ${r.input}: ${r.error || '未知错误'}`).join('\n')}` : '',
      ].filter(Boolean);
      setConvertMsg(msgLines.join('\n'));
      if (!res.success) alert(res.error || '部分文件转换失败');
    } catch (e: any) {
      const msg = e?.message || String(e);
      setConvertMsg(msg);
      alert(msg);
    } finally {
      setIsConverting(false);
    }
  }, [canConvertM4a, m4aFiles]);

  return (
    <div className="h-full w-full flex flex-col bg-slate-900 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-850/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateTo('editor')}
            className="flex items-center px-3 py-1.5 text-sm rounded-md bg-slate-800 text-slate-200 border border-slate-700 hover:border-sky-500 hover:text-sky-100 transition"
            title="返回项目编辑"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-1" />
            返回编辑
          </button>
          <div>
            <h1 className="text-2xl font-bold text-sky-400">辅助工具</h1>
            <p className="text-sm text-slate-400">为工作流提供批量、小工具支持（功能在 Electron 侧落地）。</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 border border-slate-700">
            <CloudArrowDownIcon className="w-4 h-4 text-sky-300" />
            <span>依赖本地 Audition 标记</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 border border-slate-700">
            <ArrowPathIcon className="w-4 h-4 text-emerald-300" />
            <span>跨音频批量迁移</span>
          </div>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto p-6 space-y-5">
        {/* 转写/字幕清洗：去时间戳 */}
        <div className="bg-slate-850 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-slate-900/30">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-sky-900/40 border border-sky-600/40 flex items-center justify-center text-sky-200">
                <WrenchIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl font-semibold text-slate-50">转写/字幕清洗（去时间戳）</div>
                <div className="text-sm text-slate-400">
                  删除 00:00 / 00:00:00 / 时间范围等行，保留文字并删除空行（需在 Electron 中使用）。
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCleanTranscript}
                disabled={!canCleanTranscript || isCleaningTranscript || !transcriptInput.trim()}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs border transition',
                  !canCleanTranscript || isCleaningTranscript || !transcriptInput.trim()
                    ? 'bg-slate-700 text-slate-500 border-slate-600 cursor-not-allowed'
                    : 'bg-sky-700 hover:bg-sky-600 text-white border-sky-500'
                )}
                title={canCleanTranscript ? '开始清洗（Electron）' : '需在 Electron 中使用'}
              >
                {isCleaningTranscript ? '处理中…' : '清洗'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm text-slate-200">
                <span>原始文本</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePasteTranscript}
                    className="text-xs text-sky-300 hover:text-sky-100"
                    title="从剪贴板粘贴"
                  >
                    粘贴
                  </button>
                  <button
                    onClick={() => {
                      setTranscriptInput('');
                      setTranscriptMsg(null);
                    }}
                    className="text-xs text-slate-400 hover:text-slate-200"
                    title="清空输入"
                  >
                    清空
                  </button>
                </div>
              </div>
              <textarea
                value={transcriptInput}
                onChange={(e) => setTranscriptInput(e.target.value)}
                placeholder={'示例：\n00:00\n这部剧绝对是岛国近年来最刺激的神剧\n\n00:02\n隔壁的鱿鱼游戏在他面前就是弟弟'}
                className="w-full min-h-[220px] max-h-[420px] resize-y rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm text-slate-200">
                <span>清洗结果</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyTranscriptOutput}
                    disabled={!transcriptOutput.trim()}
                    className={cn(
                      'text-xs transition',
                      !transcriptOutput.trim() ? 'text-slate-500 cursor-not-allowed' : 'text-sky-300 hover:text-sky-100'
                    )}
                    title="复制结果到剪贴板"
                  >
                    复制
                  </button>
                  <button
                    onClick={() => {
                      if (!transcriptOutput.trim()) return;
                      setTranscriptInput(transcriptOutput);
                      setTranscriptOutput('');
                      setTranscriptMsg('已用结果覆盖输入');
                    }}
                    disabled={!transcriptOutput.trim()}
                    className={cn(
                      'text-xs transition',
                      !transcriptOutput.trim() ? 'text-slate-500 cursor-not-allowed' : 'text-slate-300 hover:text-slate-100'
                    )}
                    title="用结果覆盖输入，方便再次处理"
                  >
                    覆盖输入
                  </button>
                </div>
              </div>
              <textarea
                value={transcriptOutput}
                readOnly
                placeholder="清洗后的文字会显示在这里"
                className="w-full min-h-[220px] max-h-[420px] resize-y rounded-lg bg-slate-900/40 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none"
              />
            </div>
          </div>

          {transcriptMsg && (
            <div className="mt-3 text-sm text-slate-200 bg-slate-800/80 border border-slate-700 rounded-lg p-3 whitespace-pre-wrap">
              {transcriptMsg}
            </div>
          )}
          {!canCleanTranscript && <div className="mt-2 text-[11px] text-amber-300">需在 Electron 中使用</div>}
        </div>

        {/* 批量转码：m4a -> mp3 */}
        <div className="bg-slate-850 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-slate-900/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-emerald-900/50 border border-emerald-600/50 flex items-center justify-center text-emerald-200">
                <WrenchIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl font-semibold text-slate-50">批量 m4a → mp3</div>
                <div className="text-sm text-slate-400">
                  320k · 输出原目录 · 覆盖同名 mp3 · 保留元数据（需在 Electron 中使用）。
                </div>
              </div>
            </div>
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
          </div>

          <div
            className={cn(
              'bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col gap-3',
              m4aFiles.length > 0 ? 'border-emerald-600/70' : ''
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleM4aFiles(e.dataTransfer.files);
            }}
          >
            <div className="flex items-center justify-between text-sm text-slate-200">
              <span>m4a 文件</span>
              <button onClick={handleBrowseM4a} className="text-xs text-sky-300 hover:text-sky-100">
                选择文件
              </button>
            </div>
            <div className="flex flex-col flex-grow gap-2">
              <div className="border-2 border-dashed border-slate-600 rounded-lg p-4 text-center text-slate-300 bg-slate-900/60">
                <UploadIcon className="w-6 h-6 mx-auto text-sky-300" />
                <p className="mt-2 text-sm">将 m4a 文件拖到这里</p>
                <p className="text-xs text-slate-500">会在原目录生成同名 mp3（覆盖同名）</p>
                {!canConvertM4a && <p className="text-[11px] text-amber-300 mt-2">需在 Electron 中使用</p>}
              </div>
              <div className="text-xs text-slate-400">
                {m4aFiles.length === 0 ? (
                  <span>已选：无</span>
                ) : (
                  <>
                    <span>已选 {m4aFiles.length} 个</span>
                    <div className="mt-1 space-y-1 max-h-36 overflow-y-auto">
                      {m4aFiles.map((f: any) => (
                        <div
                          key={`${f.name}-${f.path || ''}`}
                          className="flex items-center justify-between bg-slate-750/80 rounded px-2 py-1"
                        >
                          <span className="truncate" title={f.path || f.name}>
                            {f.name}
                          </span>
                        </div>
                      ))}
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
            onChange={(e) => handleM4aFiles(e.target.files)}
            accept=".m4a"
          />
        </div>

        {/* 写入转写文档时间戳到 MP3 的 Audition CuePoint 标记 */}
        <div className="bg-slate-850 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-slate-900/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-fuchsia-900/40 border border-fuchsia-600/40 flex items-center justify-center text-fuchsia-200">
                <WrenchIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl font-semibold text-slate-50">转写文档 → Audition 标记写入</div>
                <div className="text-sm text-slate-400">
                  根据带时间戳的 .docx/.txt，把每行时间直接写入原 MP3 的 Audition CuePoint（XMP），方便你在 Audition 里拖动修改标记（支持批量：两侧可多选，按章节号自动配对；写入前建议先关闭 Audition；若不显示，尝试删除同名 .pkf 缓存再打开）。
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleWriteCuePoints}
                disabled={!canWriteCuePoints || isWritingCuePoints || cueMp3Files.length === 0 || cueTranscriptFiles.length === 0}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs border transition',
                  !canWriteCuePoints || isWritingCuePoints || cueMp3Files.length === 0 || cueTranscriptFiles.length === 0
                    ? 'bg-slate-700 text-slate-500 border-slate-600 cursor-not-allowed'
                    : 'bg-fuchsia-700 hover:bg-fuchsia-600 text-white border-fuchsia-500'
                )}
                title={canWriteCuePoints ? '写入 Audition 标记（Electron）' : '需在 Electron 中使用'}
              >
                {isWritingCuePoints ? '写入中…' : '写入标记'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
            <div
              className={cn(
                'bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col gap-3 transition',
                cueMp3Files.length > 0 ? 'border-fuchsia-600/60' : ''
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleCueMp3Files(e.dataTransfer.files);
              }}
            >
              <div className="flex items-center justify-between text-sm text-slate-200">
                <span>目标 MP3（待写入标记）</span>
                <button onClick={handleBrowseCueMp3} className="text-xs text-sky-300 hover:text-sky-100">
                  选择文件
                </button>
              </div>
              <div className="flex flex-col flex-grow gap-2">
                <div className="border-2 border-dashed border-slate-600 rounded-lg p-4 text-center text-slate-300 bg-slate-900/60">
                  <UploadIcon className="w-6 h-6 mx-auto text-fuchsia-300" />
                  <p className="mt-2 text-sm">将 MP3 拖到这里</p>
                  <p className="text-xs text-slate-500">会直接覆盖写入原文件（建议先自行备份）</p>
                  {!canWriteCuePoints && <p className="text-[11px] text-amber-300 mt-2">需在 Electron 中使用</p>}
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
                        {cueMp3List.map((f) => (
                          <div
                            key={`${f.name}-${f.path || ''}`}
                            className="flex items-center justify-between bg-slate-750/80 rounded px-2 py-1"
                          >
                            <span className="truncate" title={f.path || f.name}>
                              {f.name}
                            </span>
                            <button
                              className="text-xs text-slate-400 hover:text-slate-200"
                              onClick={() => setCueMp3Files((prev) => prev.filter((x: any) => (x.path || x.name) !== (f.path || f.name)))}
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
                {!canWriteCuePoints && <div className="text-[11px] text-amber-300">需在 Electron 中使用</div>}
              </div>
            </div>

            <div
              className={cn(
                'bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col gap-3 transition',
                cueTranscriptFiles.length > 0 ? 'border-emerald-600/60' : ''
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleCueTranscriptFiles(e.dataTransfer.files);
              }}
            >
              <div className="flex items-center justify-between text-sm text-slate-200">
                <span>转写文档（带时间戳）</span>
                <button onClick={handleBrowseCueTranscript} className="text-xs text-sky-300 hover:text-sky-100">
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
                        {cueTranscriptList.map((f) => (
                          <div
                            key={`${f.name}-${f.path || ''}`}
                            className="flex items-center justify-between bg-slate-750/80 rounded px-2 py-1"
                          >
                            <span className="truncate" title={f.path || f.name}>
                              {f.name}
                            </span>
                            <button
                              className="text-xs text-slate-400 hover:text-slate-200"
                              onClick={() =>
                                setCueTranscriptFiles((prev) => prev.filter((x: any) => (x.path || x.name) !== (f.path || f.name)))
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
            onChange={(e) => handleCueMp3Files(e.target.files)}
            accept=".mp3"
          />
          <input
            ref={cueTranscriptInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleCueTranscriptFiles(e.target.files)}
            accept=".docx,.txt"
          />
        </div>

        {/* 标记迁移：源/目标双列上传区 */}
        <div className="bg-slate-850 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-slate-900/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-sky-900/60 border border-sky-600/50 flex items-center justify-center text-sky-200">
                <WrenchIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xl font-semibold text-slate-50">Audition 标记跨音频迁移</div>
                <div className="text-sm text-slate-400">拖入源音频（已含标记）和目标音频，后续由 Electron 执行标记复制。</div>
              </div>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-sky-800/70 text-sky-100 border border-sky-600/60">
              UI 就绪 · 功能待接入
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
            <div
              className={cn(
                'bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col gap-3',
                'transition',
                sourceFiles.length > 0 ? 'border-sky-600/70' : ''
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, 'source')}
            >
              <div className="flex items-center justify-between text-sm text-slate-200">
                <span>源音频（含标记）</span>
                <button
                  onClick={() => handleBrowse('source')}
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
                        {sourceList.map((f) => (
                          <div key={f.name} className="flex items-center justify-between bg-slate-750/80 rounded px-2 py-1">
                            <span className="truncate" title={f.path || f.name}>{f.name}</span>
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
                  disabled={isTransferring || sourceFiles.length === 0 || targetFiles.length === 0 || !isElectron}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs border transition',
                    isTransferring || sourceFiles.length === 0 || targetFiles.length === 0 || !isElectron
                      ? 'bg-slate-700 text-slate-500 border-slate-600 cursor-not-allowed'
                      : 'bg-sky-700 hover:bg-sky-600 text-white border-sky-500'
                  )}
                  title={isElectron ? '执行标记迁移（Electron）' : '需在 Electron 中使用'}
                >
                  {isTransferring ? '迁移中…' : '开始迁移'}
                </button>
                {!isElectron && <div className="text-[11px] text-amber-300">需在 Electron 中使用</div>}
              </div>
            </div>

            <div
              className={cn(
                'bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-col gap-3',
                targetFiles.length > 0 ? 'border-emerald-600/70' : ''
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, 'target')}
            >
              <div className="flex items-center justify-between text-sm text-slate-200">
                <span>目标音频（待写入标记）</span>
                <button
                  onClick={() => handleBrowse('target')}
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
                        {targetList.map((f) => (
                          <div key={f.name} className="flex items-center justify-between bg-slate-750/80 rounded px-2 py-1">
                            <span className="truncate" title={f.path || f.name}>{f.name}</span>
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
            onChange={(e) => handleFiles(e.target.files, 'source')}
            accept=".mp3,.wav,.flac,.m4a,.aac,.ogg,.wma"
          />
          <input
            ref={targetInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files, 'target')}
            accept=".mp3,.wav,.flac,.m4a,.aac,.ogg,.wma"
          />
        </div>
      </div>
    </div>
  );
};

export default ToolsPage;
