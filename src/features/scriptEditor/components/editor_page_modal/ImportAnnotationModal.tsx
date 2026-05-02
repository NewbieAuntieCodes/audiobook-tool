import React, { useState } from 'react';
import { InformationCircleIcon, ClipboardIcon, CheckCircleIcon } from '../../../../components/ui/icons';

interface ImportAnnotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (annotatedText: string) => void | Promise<void>;
  onAutoAnnotate: () => void | Promise<void>;
  onAutoAnnotateWithLocalCodex: () => void | Promise<void>;
  onAutoAnnotateWithDeepSeek: (mode: 'flash' | 'pro') => void | Promise<void>;
  isLoading: boolean;
  chapterContentToCopy: string;
  isLocalCodexTaskRunning?: boolean;
}

const ImportAnnotationModal: React.FC<ImportAnnotationModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  onAutoAnnotate,
  onAutoAnnotateWithLocalCodex,
  onAutoAnnotateWithDeepSeek,
  isLoading,
  chapterContentToCopy,
  isLocalCodexTaskRunning = false,
}) => {
  const [annotatedText, setAnnotatedText] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [isManualImportOpen, setIsManualImportOpen] = useState(false);
  const [activeDeepSeekMode, setActiveDeepSeekMode] = useState<'flash' | 'pro' | null>(null);
  const canUseDeepSeek =
    typeof window !== 'undefined' &&
    typeof window.electronAPI?.runDeepSeekRoleSync === 'function';

  React.useEffect(() => {
    if (isOpen) {
      setAnnotatedText(''); // Clear text area when modal opens
      setCopyStatus('idle');
      setIsManualImportOpen(false);
      setActiveDeepSeekMode(null);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isLoading) {
      setActiveDeepSeekMode(null);
    }
  }, [isLoading]);

  const aiPrompt = `为了帮助小助手们更精准地标注角色，请将每个对话行详细标注成【角色】“台词内容”或者【CV-角色】“台词内容”的格式，并请勿误判非对话行。

**重要提醒：请不要合并同一个角色在原文中的每一段话到同一个标注里，并且请原样保留引号（“”）内的所有字符，包括逗号、句号或其他标点符号，切勿修改或删减引号内部内容。**

比如原始文本是
“风雪交加”，
“他抬起头，微笑着。”

填写后应该是
“风雪交加”，
“他抬起头，微笑着。”

精准的标注示例
“风雪交加”，
“他抬起头，微笑着。”

你的数据是
[你的章节原文]`;

  const handleCopyClick = () => {
    const fullPrompt = aiPrompt.replace('[你的章节原文]', chapterContentToCopy || '');
    if (!chapterContentToCopy) {
      alert("没有要复制的章节内容。请在编辑器中选择一个章节。");
      return;
    }
    navigator.clipboard.writeText(fullPrompt).then(() => {
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      alert('复制失败，请手动复制。');
    });
  };

  // FIX: Define the handleSubmit function to call the onSubmit prop.
  const handleSubmit = () => {
    onSubmit(annotatedText);
  };

  const handleDeepSeekClick = (mode: 'flash' | 'pro') => {
    setActiveDeepSeekMode(mode);
    void Promise.resolve(onAutoAnnotateWithDeepSeek(mode)).finally(() => {
      setActiveDeepSeekMode((currentMode) => (currentMode === mode ? null : currentMode));
    });
  };

  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
      <div className="flex h-[92vh] w-full max-w-3xl flex-col rounded-lg bg-slate-800 shadow-xl">
        <div className="flex-shrink-0 border-b border-slate-700 px-6 py-4">
          <h2 className="text-2xl font-semibold text-slate-100">导入 AI 辅助标注文本</h2>
        </div>

        <div className="flex-shrink-0 border-b border-teal-500/30 bg-slate-850 px-6 py-3">
          <div className="rounded-md border border-teal-500/40 bg-teal-950/30 p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-teal-200">推荐：DeepSeek 自动画本</h3>
                <p className="mt-1 text-xs leading-5 text-teal-100/80">
                  已填写 DeepSeek API 后，直接点这里。快速适合先跑一章测试，精细适合难章节复查。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleDeepSeekClick('flash')}
                  className="rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-500 disabled:opacity-50"
                  title={
                    canUseDeepSeek
                      ? '通过 Electron 调用 DeepSeek 快速模型，适合大批量初标'
                      : '当前 Electron 版本未提供 DeepSeek 能力'
                  }
                  disabled={isLoading || isLocalCodexTaskRunning || !canUseDeepSeek}
                >
                  {activeDeepSeekMode === 'flash' ? '快速处理中...' : 'DeepSeek 快速'}
                </button>
                <button
                  onClick={() => handleDeepSeekClick('pro')}
                  className="rounded-md bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-fuchsia-500 disabled:opacity-50"
                  title={
                    canUseDeepSeek
                      ? '通过 Electron 调用 DeepSeek Pro，适合难章节和多人对话'
                      : '当前 Electron 版本未提供 DeepSeek 能力'
                  }
                  disabled={isLoading || isLocalCodexTaskRunning || !canUseDeepSeek}
                >
                  {activeDeepSeekMode === 'pro' ? '精细处理中...' : 'DeepSeek 精细'}
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 text-sm text-slate-300">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setIsManualImportOpen((value) => !value)}
              className="flex w-full items-center justify-between rounded-md border border-slate-600 bg-slate-700/70 px-4 py-3 text-left transition-colors hover:bg-slate-700"
            >
              <span>
                <span className="block text-base font-semibold text-sky-300">备用手动导入</span>
                <span className="mt-1 block text-xs text-slate-300">
                  需要外部 AI 或旧流程时再展开，日常建议直接使用上方 DeepSeek 按钮。
                </span>
              </span>
              <span className="ml-4 text-sm font-semibold text-slate-200">
                {isManualImportOpen ? '收起' : '展开'}
              </span>
            </button>

            {isManualImportOpen && (
              <div className="space-y-4 rounded-md border border-slate-600 bg-slate-700 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-base text-sky-300">让外部 AI 处理文本</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-300">
                      保留给 ChatGPT、Kimi 或旧 API 直连流程。它只作为备用，不影响上方 DeepSeek 自动画本。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      onClick={() => { void onAutoAnnotate(); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-md disabled:opacity-50 transition-colors"
                      title="使用设置里的 Base URL、API Key 和 Model 直接请求接口"
                      disabled={isLoading}
                    >
                      <span>{isLoading ? '处理中...' : 'API 直连'}</span>
                    </button>
                    <button
                      onClick={handleCopyClick}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md disabled:opacity-50 transition-colors"
                      title="复制完整提示词"
                      disabled={!chapterContentToCopy || isLoading}
                    >
                      {copyStatus === 'copied' ? (
                        <>
                          <CheckCircleIcon className="w-4 h-4" />
                          <span>已复制</span>
                        </>
                      ) : (
                        <>
                          <ClipboardIcon className="w-4 h-4" />
                          <span>复制提示</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <pre className="max-h-48 overflow-auto rounded bg-slate-900 p-2 text-xs text-sky-200 select-all">
                  {aiPrompt}
                </pre>

                <div className="rounded-md bg-slate-800/70 p-3">
                  <h3 className="mb-2 font-semibold text-base text-sky-300">粘贴 AI 返回的结果</h3>
                  <div className="flex items-start text-xs text-slate-400">
                    <InformationCircleIcon className="w-4 h-4 mr-1.5 flex-shrink-0 mt-0.5" />
                    <span>只会更新内容完全匹配的对话行。旁白和不匹配的行将被忽略。</span>
                  </div>
                </div>

                <textarea
                  value={annotatedText}
                  onChange={(e) => setAnnotatedText(e.target.value)}
                  className="h-40 w-full rounded-md border border-slate-600 bg-slate-900 p-3 text-slate-100 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
                  placeholder="在此处粘贴 AI 生成的标注文本..."
                  disabled={isLoading}
                  aria-label="Paste annotated script here"
                />
              </div>
            )}
          </div>
          </div>

        <div className="flex flex-shrink-0 justify-end space-x-3 border-t border-slate-700 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-600 hover:bg-slate-500 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || !annotatedText.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50"
          >
            {isLoading ? '处理中...' : '处理导入'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportAnnotationModal;
