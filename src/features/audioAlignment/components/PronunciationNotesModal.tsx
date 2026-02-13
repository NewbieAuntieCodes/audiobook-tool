import React, { useEffect, useMemo, useState } from 'react';
import { PronunciationNote } from '../../../types';

type ImportEntry = { term: string; pinyin: string; note?: string };

interface PronunciationNotesModalProps {
  isOpen: boolean;
  notes: PronunciationNote[];
  onClose: () => void;
  onSave: (notes: PronunciationNote[]) => void;
}

const createNoteId = () => `pn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const normalizeNotes = (notes: PronunciationNote[]): PronunciationNote[] => {
  const map = new Map<string, PronunciationNote>();
  for (const n of notes || []) {
    const term = (n?.term || '').trim();
    const pinyin = (n?.pinyin || '').trim();
    if (!term || !pinyin) continue;
    map.set(term, { ...n, term, pinyin });
  }
  return Array.from(map.values());
};

const parseImportText = (raw: string): ImportEntry[] => {
  const text = (raw || '').trim();
  if (!text) return [];

  // JSON array/object
  if (text.startsWith('[') || text.startsWith('{')) {
    const parsed = JSON.parse(text) as any;
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list
      .map((x: any) => ({
        term: typeof x?.term === 'string' ? x.term.trim() : '',
        pinyin: typeof x?.pinyin === 'string' ? x.pinyin.trim() : '',
        note: typeof x?.note === 'string' ? x.note : undefined,
      }))
      .filter((x) => !!x.term && !!x.pinyin);
  }

  // TSV/CSV/plain lines: term \t pinyin [\t note]
  const lines = text.split(/\r?\n/);
  const entries: ImportEntry[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.includes('\t') ? trimmed.split('\t') : trimmed.split(',');
    const term = (parts[0] || '').trim();
    const pinyin = (parts[1] || '').trim();
    const note = (parts.slice(2).join(parts.length > 2 && trimmed.includes('\t') ? '\t' : ',') || '').trim();
    if (!term || !pinyin) continue;
    entries.push({ term, pinyin, note: note || undefined });
  }
  return entries;
};

const PronunciationNotesModal: React.FC<PronunciationNotesModalProps> = ({ isOpen, notes, onClose, onSave }) => {
  const [draft, setDraft] = useState<PronunciationNote[]>([]);
  const [term, setTerm] = useState('');
  const [pinyin, setPinyin] = useState('');
  const [note, setNote] = useState('');
  const [importText, setImportText] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setDraft(normalizeNotes(notes || []));
    setTerm('');
    setPinyin('');
    setNote('');
    setImportText('');
  }, [isOpen, notes]);

  const sortedDraft = useMemo(() => {
    return [...draft].sort((a, b) => {
      const len = (b.term || '').length - (a.term || '').length;
      if (len !== 0) return len;
      return (a.term || '').localeCompare(b.term || '', 'zh-Hans-CN');
    });
  }, [draft]);

  const exportJson = useMemo(() => {
    const simplified = normalizeNotes(draft).map((n) => ({ term: n.term, pinyin: n.pinyin, note: n.note }));
    return JSON.stringify(simplified, null, 2);
  }, [draft]);

  if (!isOpen) return null;

  const handleAddOrUpdate = () => {
    const t = term.trim();
    const p = pinyin.trim();
    if (!t || !p) {
      alert('请输入“词/短语”和“拼音”。');
      return;
    }

    const existing = draft.find((x) => (x.term || '').trim() === t);
    if (existing) {
      setDraft((prev) =>
        prev.map((x) =>
          x.id === existing.id
            ? { ...x, term: t, pinyin: p, note: (note || '').trim() || undefined, updatedAt: Date.now() }
            : x,
        ),
      );
    } else {
      const now = Date.now();
      setDraft((prev) => [
        ...prev,
        {
          id: createNoteId(),
          term: t,
          pinyin: p,
          note: (note || '').trim() || undefined,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    }

    setTerm('');
    setPinyin('');
    setNote('');
  };

  const handleDelete = (id: string) => {
    const target = draft.find((x) => x.id === id);
    const ok = window.confirm(`确认删除拼音备注「${target?.term || ''}」？`);
    if (!ok) return;
    setDraft((prev) => prev.filter((x) => x.id !== id));
  };

  const handleSave = () => {
    onSave(normalizeNotes(draft));
    onClose();
  };

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportJson);
      alert('已复制到剪贴板。');
    } catch {
      alert('复制失败：当前环境可能不支持剪贴板权限。你也可以手动全选下面文本复制。');
    }
  };

  const handleImportMerge = () => {
    let entries: ImportEntry[] = [];
    try {
      entries = parseImportText(importText);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`导入失败：${msg}`);
      return;
    }

    if (entries.length === 0) {
      alert('没有解析到可导入的词条。');
      return;
    }

    const now = Date.now();
    const byTerm = new Map<string, PronunciationNote>();
    for (const n of normalizeNotes(draft)) {
      byTerm.set(n.term, n);
    }

    for (const e of entries) {
      const t = e.term.trim();
      const p = e.pinyin.trim();
      if (!t || !p) continue;
      const existing = byTerm.get(t);
      if (existing) {
        byTerm.set(t, {
          ...existing,
          term: t,
          pinyin: p,
          note: (e.note || '').trim() || existing.note,
          updatedAt: now,
        });
      } else {
        byTerm.set(t, {
          id: createNoteId(),
          term: t,
          pinyin: p,
          note: (e.note || '').trim() || undefined,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    setDraft(Array.from(byTerm.values()));
    alert(`已合并导入 ${entries.length} 条（按“词”去重）。`);
  };

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[80] p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="p-5 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">本书拼音备注（常显）</h2>
            <div className="text-xs text-slate-400 mt-1">
              本书任意位置出现该词/短语都会显示拼音，方便 CV 录制校对。
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
          >
            关闭
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <div className="bg-slate-900/40 border border-slate-700 rounded-md p-4">
            <div className="text-sm font-semibold text-slate-200 mb-3">添加/更新词条</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">词/短语</label>
                <input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="例如：尽量"
                  className="w-full px-3 py-2 text-sm bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">拼音</label>
                <input
                  value={pinyin}
                  onChange={(e) => setPinyin(e.target.value)}
                  placeholder="例如：jìn liàng"
                  className="w-full px-3 py-2 text-sm bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">备注（可选）</label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="例如：不要读成 jǐn liáng"
                  className="w-full px-3 py-2 text-sm bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handleAddOrUpdate}
                className="px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md"
              >
                添加/更新
              </button>
              <div className="text-xs text-slate-400">同词重复添加会自动覆盖拼音。</div>
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-700 rounded-md p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-slate-200">当前词条（{sortedDraft.length}）</div>
            </div>
            {sortedDraft.length === 0 ? (
              <div className="text-sm text-slate-500">暂无拼音备注。</div>
            ) : (
              <div className="space-y-2">
                {sortedDraft.map((n) => (
                  <div key={n.id} className="flex items-start gap-2 bg-slate-800 rounded-md border border-slate-700 p-2">
                    <div className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-2">
                      <input
                        value={n.term}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((x) =>
                              x.id === n.id ? { ...x, term: e.target.value, updatedAt: Date.now() } : x,
                            ),
                          )
                        }
                        className="px-2 py-1.5 text-sm bg-slate-700 text-slate-100 rounded border border-slate-600"
                      />
                      <input
                        value={n.pinyin}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((x) =>
                              x.id === n.id ? { ...x, pinyin: e.target.value, updatedAt: Date.now() } : x,
                            ),
                          )
                        }
                        className="px-2 py-1.5 text-sm bg-slate-700 text-slate-100 rounded border border-slate-600"
                      />
                      <input
                        value={n.note || ''}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((x) =>
                              x.id === n.id ? { ...x, note: e.target.value || undefined, updatedAt: Date.now() } : x,
                            ),
                          )
                        }
                        className="px-2 py-1.5 text-sm bg-slate-700 text-slate-100 rounded border border-slate-600"
                      />
                    </div>
                    <button
                      onClick={() => handleDelete(n.id)}
                      className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 rounded text-white flex-shrink-0"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-900/40 border border-slate-700 rounded-md p-4">
            <div className="text-sm font-semibold text-slate-200 mb-3">跨书复用（导入/导出）</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-slate-400">导出（JSON）</div>
                  <button
                    onClick={handleCopyExport}
                    className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
                  >
                    复制
                  </button>
                </div>
                <textarea
                  value={exportJson}
                  readOnly
                  rows={8}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-slate-400">导入并合并（JSON 或 TSV：term\\tpinyin）</div>
                  <button
                    onClick={handleImportMerge}
                    className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
                  >
                    合并导入
                  </button>
                </div>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  rows={8}
                  placeholder='例如：\n[\n  { "term": "尽量", "pinyin": "jìn liàng" }\n]\n\n或：\n尽量\tjìn liàng'
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-slate-700 flex items-center justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 rounded text-white"
          >
            保存到本书
          </button>
        </div>
      </div>
    </div>
  );
};

export default PronunciationNotesModal;

