import { useCallback, useState } from 'react';
import { cn } from '../../../utils/cn';
import ToolSection from './ToolSection';

const TranscriptCleanerPanel = () => {
  const canCleanTranscript =
    typeof window !== 'undefined' && !!window.electronAPI?.cleanTranscriptText;
  const [transcriptInput, setTranscriptInput] = useState('');
  const [transcriptOutput, setTranscriptOutput] = useState('');
  const [isCleaningTranscript, setIsCleaningTranscript] = useState(false);
  const [transcriptMsg, setTranscriptMsg] = useState<string | null>(null);

  const handlePasteTranscript = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setTranscriptInput(text || '');
      setTranscriptMsg(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setTranscriptMsg(`读取剪贴板失败：${message}`);
    }
  }, []);

  const handleCopyTranscriptOutput = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(transcriptOutput || '');
      setTranscriptMsg('已复制到剪贴板');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setTranscriptMsg(`复制失败：${message}`);
    }
  }, [transcriptOutput]);

  const handleCleanTranscript = useCallback(async () => {
    if (!transcriptInput.trim()) {
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
      const result = await window.electronAPI.cleanTranscriptText({
        text: transcriptInput,
        removeEmptyLines: true,
      });
      if (!result.success) {
        throw new Error(result.error || '清洗失败');
      }

      setTranscriptOutput(result.text || '');
      setTranscriptMsg('清洗完成');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setTranscriptMsg(message);
    } finally {
      setIsCleaningTranscript(false);
    }
  }, [transcriptInput]);

  return (
    <ToolSection
      title="转写/字幕清洗（去时间戳）"
      description="删除 00:00 / 00:00:00 / 时间范围等行，保留文字并删除空行（需在 Electron 中使用）。"
      iconClassName="bg-sky-900/40 border-sky-600/40 text-sky-200"
      actions={
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
      }
    >
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
            onChange={(event) => setTranscriptInput(event.target.value)}
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
                  !transcriptOutput.trim()
                    ? 'text-slate-500 cursor-not-allowed'
                    : 'text-sky-300 hover:text-sky-100'
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
                  !transcriptOutput.trim()
                    ? 'text-slate-500 cursor-not-allowed'
                    : 'text-slate-300 hover:text-slate-100'
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
      {!canCleanTranscript && (
        <div className="mt-2 text-[11px] text-amber-300">需在 Electron 中使用</div>
      )}
    </ToolSection>
  );
};

export default TranscriptCleanerPanel;
