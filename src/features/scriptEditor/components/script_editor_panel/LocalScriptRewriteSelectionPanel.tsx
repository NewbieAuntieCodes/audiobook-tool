import React from 'react';
import { normalizeSpeakerLabel } from './localScriptRewriteModalData';

interface LocalScriptRewriteSelectionPanelProps {
  onSelectedTextChange: (value: string) => void;
  selectedSegments: LocalCodexScriptRewriteSelectionSegment[];
  selectedText: string;
}

export default function LocalScriptRewriteSelectionPanel({
  onSelectedTextChange,
  selectedSegments,
  selectedText,
}: LocalScriptRewriteSelectionPanelProps) {
  const selectedBlocks = selectedSegments.flatMap((segment) => segment.blocks);
  const segmentCount = selectedSegments.length;
  const blockCount = selectedBlocks.length;

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex min-h-0 flex-col rounded-lg border border-slate-700 bg-slate-900/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-200">已选脚本段</h3>
          <span className="text-xs text-slate-400">
            {segmentCount} 段 / {blockCount} 块
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/70 p-3">
          {selectedSegments.length === 0 ? (
            <p className="text-sm text-slate-400">当前没有选中的脚本段。</p>
          ) : (
            <div className="space-y-4">
              {selectedSegments.map((segment, segmentIndex) => (
                <div
                  key={segment.segmentId}
                  className="rounded-lg border border-slate-700 bg-slate-900/80 p-3"
                >
                  <div className="mb-3 flex items-center justify-between text-xs text-slate-300">
                    <span className="rounded-full bg-slate-700 px-2 py-0.5">
                      选区 {segmentIndex + 1}
                    </span>
                    <span>
                      第 {segment.startLine}-{segment.endLine} 块 · 共{' '}
                      {segment.blocks.length} 块
                    </span>
                  </div>
                  <div className="space-y-3">
                    {segment.blocks.map((block) => (
                      <div
                        key={block.lineId}
                        className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3"
                      >
                        <div className="mb-1 flex items-center gap-2 text-xs text-amber-200">
                          <span className="rounded-full bg-amber-500/20 px-2 py-0.5">
                            #{block.index}
                          </span>
                          <span>{normalizeSpeakerLabel(block.speakerName)}</span>
                          {block.soundType && (
                            <span className="rounded-full bg-slate-700 px-2 py-0.5 text-slate-200">
                              {block.soundType}
                            </span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-100">
                          {block.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          每一段都会单独附带前后上下文，只用于理解语义，不会改写选区外内容。
        </p>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-200">发送给 AI 的文本</h3>
          <span className="text-xs text-slate-400">可手动微调</span>
        </div>
        <textarea
          value={selectedText}
          onChange={(event) => onSelectedTextChange(event.target.value)}
          placeholder="这里是送给 AI 的多段选区快照。"
          className="h-44 w-full resize-none rounded-md border border-slate-700 bg-slate-950/80 p-3 text-sm leading-6 text-slate-100 outline-none"
        />
      </div>
    </div>
  );
}
