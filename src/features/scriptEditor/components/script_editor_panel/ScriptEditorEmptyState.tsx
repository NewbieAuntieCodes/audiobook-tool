import React from 'react';
import { SaveIcon } from '../../../../components/ui/icons';

interface ScriptEditorEmptyStateProps {
  rawContent: string;
  editableRawContent: string;
  isRawContentDirty: boolean;
  onSaveRawContent: () => void;
  onRawContentChange: React.ChangeEventHandler<HTMLTextAreaElement>;
}

export default function ScriptEditorEmptyState({
  rawContent,
  editableRawContent,
  isRawContentDirty,
  onSaveRawContent,
  onRawContentChange,
}: ScriptEditorEmptyStateProps) {
  return (
    <div className="text-slate-400 space-y-3 p-3 h-full flex flex-col">
      <p>
        {rawContent.trim() === ''
          ? '这个章节还没有任何原始文本。'
          : '还没有生成剧本行。'}
        {rawContent.trim() !== '' &&
          ' 可以使用上方的 “AI 标注章节” 或 “手动解析章节” 按钮生成台本行。'}
      </p>
      <div className="mt-4 p-3 bg-slate-700 rounded-md flex flex-col flex-grow">
        <div className="flex justify-between items-center mb-2 flex-shrink-0">
          <h4 className="text-sm font-semibold text-slate-300">
            原始章节内容编辑
          </h4>
          <button
            onClick={onSaveRawContent}
            disabled={!isRawContentDirty}
            className="flex items-center px-2.5 py-1 text-xs bg-sky-600 hover:bg-sky-700 text-white rounded-md disabled:opacity-50"
            title={
              isRawContentDirty ? '保存对原始内容的修改' : '没有修改需要保存'
            }
          >
            <SaveIcon className="w-3.5 h-3.5 mr-1" />
            保存原文
          </button>
        </div>
        <textarea
          value={editableRawContent}
          onChange={onRawContentChange}
          spellCheck={false}
          className="text-xs text-slate-300 whitespace-pre-wrap overflow-y-auto flex-grow bg-slate-800 p-4 rounded-md w-full h-full resize-none border border-slate-600 focus:ring-1 focus:ring-sky-500 focus:border-sky-500 outline-none"
          aria-label="原始章节内容编辑"
        />
      </div>
    </div>
  );
}
