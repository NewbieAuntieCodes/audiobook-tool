import React, { useEffect, useState } from 'react';
import { SoundGroup, SoundLibraryItem } from '../../../types';
import { getNearestFolderNameFromSoundName, getSoundFileNameFromSoundName } from '../../../lib/soundPath';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import {
  createSoundGroupId,
  toDraftClips,
  type DraftClip,
  type SoundGroupKind,
} from './soundGroupModalData';
import { useSoundGroupModalDerivedData } from './useSoundGroupModalDerivedData';
import { useSoundGroupPreviewActions } from './useSoundGroupPreviewActions';
import { useSoundGroupLibraryBrowser } from './useSoundGroupLibraryBrowser';

interface SoundGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 把选中的音效组插入到当前光标/选区起点 */
  onInsert: (groupId: string, groupName?: string) => void;
  soundLibrary: SoundLibraryItem[];
  soundGroups: SoundGroup[];
  onUpsertGroup: (group: SoundGroup) => void;
  onDeleteGroup: (groupId: string) => void;
  groupUsageCountById?: Record<string, number>;
}

const SoundGroupModal: React.FC<SoundGroupModalProps> = ({
  isOpen,
  onClose,
  onInsert,
  soundLibrary,
  soundGroups,
  onUpsertGroup,
  onDeleteGroup,
  groupUsageCountById,
}) => {
  const [selectedInsertValue, setSelectedInsertValue] = useState<string>('');
  const [editingGroupId, setEditingGroupId] = useState<string>('__new__');
  const [draftKind, setDraftKind] = useState<SoundGroupKind>('reaperSubproject');
  const [draftName, setDraftName] = useState('');
  const [draftClips, setDraftClips] = useState<DraftClip[]>([]);
  const [draftDurationSeconds, setDraftDurationSeconds] = useState<number | undefined>(undefined);
  const [soundSearch, setSoundSearch] = useState('');
  const {
    handleClearLibraryDirectory,
    handleSaveLibraryBasePath,
    handleSelectLibraryDirectory,
    isLibraryScanning,
    libraryBasePath,
    libraryGroups,
    libraryRootHandle,
    libraryScanError,
    librarySearch,
    setLibraryBasePath,
    setLibrarySearch,
  } = useSoundGroupLibraryBrowser({
    isOpen,
  });

  const {
    exportBasePath,
    expectedPreviewWavFileName,
    expectedReaperFileName,
    groupsById,
    insertOptions,
    selectedInsert,
    sortedGroups,
    soundLibraryMapById,
    soundLibraryMapByName,
    soundResults,
  } = useSoundGroupModalDerivedData({
    soundGroups: soundGroups || [],
    soundLibrary: soundLibrary || [],
    libraryGroups,
    librarySearch,
    selectedInsertValue,
    soundSearch,
    draftName,
    libraryBasePath,
  });
  const {
    audioPreview,
    audioRef,
    handleAutofillDurationFromLibraryPreview,
    handlePreviewLibraryWav,
    handlePreviewSound,
    isAudioPreviewLoading,
    stopPreview,
  } = useSoundGroupPreviewActions({
    draftName,
    libraryRootHandle,
    setDraftDurationSeconds,
  });

  const loadGroupIntoDraft = (groupId: string) => {
    const g = groupsById.get(groupId);
    if (!g) return;

    setEditingGroupId(g.id);
    setDraftName(g.name || '');

    const kind = (g.kind || 'expanded') as SoundGroupKind;
    setDraftKind(kind);

    if (kind === 'reaperSubproject') {
      setDraftClips([]);
      setDraftDurationSeconds(typeof g.durationSeconds === 'number' ? g.durationSeconds : undefined);
      setSoundSearch('');
      return;
    }

    setDraftDurationSeconds(undefined);
    setDraftClips(toDraftClips(g));
  };

  useEffect(() => {
    if (!isOpen) return;
    const firstProject = sortedGroups[0]?.id ? `proj:${sortedGroups[0].id}` : '';
    setSelectedInsertValue((prev) => prev || firstProject);
    if (editingGroupId === '__new__' && sortedGroups.length > 0) {
      // 首次打开时默认编辑第一个，便于快速调整
      loadGroupIntoDraft(sortedGroups[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const usageCount = (id: string) => groupUsageCountById?.[id] ?? 0;

  const resetDraftForNew = () => {
    setEditingGroupId('__new__');
    setDraftKind('reaperSubproject');
    setDraftName('');
    setDraftClips([]);
    setDraftDurationSeconds(undefined);
    setSoundSearch('');
  };

  const handleAddSoundToDraft = (sound: SoundLibraryItem) => {
    setDraftClips((prev) => [...prev, { soundId: sound.id, soundName: sound.name, offsetSeconds: 0 }]);
  };

  const handleSaveGroup = () => {
    const name = (draftName || '').trim();
    if (!name) {
      alert('请输入音效组名称，例如：进厨房');
      return;
    }
    const id = editingGroupId === '__new__' ? createSoundGroupId() : editingGroupId;

    if (draftKind === 'reaperSubproject') {
      onUpsertGroup({
        id,
        name,
        kind: 'reaperSubproject',
        reaperFileName: `${name}.rpp`,
        previewWavFileName: `${name}_preview.wav`,
        durationSeconds: draftDurationSeconds,
      });
      setEditingGroupId(id);
      setSelectedInsertValue(`proj:${id}`);
      return;
    }

    if (!draftClips || draftClips.length === 0) {
      alert('组合型音效组需要至少添加 1 条音效。');
      return;
    }

    const clips = draftClips.map((c) => ({
      soundId: c.soundId,
      soundName: c.soundName,
      offsetSeconds: Number.isFinite(c.offsetSeconds) ? c.offsetSeconds : 0,
    }));

    onUpsertGroup({ id, name, kind: 'expanded', clips });
    setEditingGroupId(id);
    setSelectedInsertValue(`proj:${id}`);
  };

  const handleDeleteCurrentGroup = () => {
    if (editingGroupId === '__new__') return;
    const g = groupsById.get(editingGroupId);
    if (!g) return;
    const n = usageCount(g.id);
    const ok = window.confirm(
      n > 0
        ? `该音效组已被插入 ${n} 次。删除后这些插入点会失效（导出时会跳过）。确认删除「${g.name}」？`
        : `确认删除音效组「${g.name}」？`,
    );
    if (!ok) return;
    onDeleteGroup(g.id);
    resetDraftForNew();
    setSelectedInsertValue((prev) => (prev === `proj:${g.id}` ? '' : prev));
  };

  const handleInsertSelected = () => {
    const v = (selectedInsertValue || '').trim();
    if (!v) {
      alert('请先选择一个音效组。');
      return;
    }

    if (v.startsWith('proj:')) {
      const id = v.slice('proj:'.length);
      const g = groupsById.get(id);
      onInsert(id, g?.name);
      return;
    }

    if (v.startsWith('lib:')) {
      const fileName = v.slice('lib:'.length);
      const entry = libraryGroups.find((x) => x.reaperFileName === fileName);
      if (!entry) {
        alert('找不到对应的库音效组，请重试。');
        return;
      }

      const existing = sortedGroups.find(
        (g) =>
          ((g.kind || 'expanded') as SoundGroupKind) === 'reaperSubproject' &&
          (g.reaperFileName || '') === entry.reaperFileName,
      );
      const id = existing?.id || createSoundGroupId();
      const group: SoundGroup = {
        id,
        name: entry.name,
        kind: 'reaperSubproject',
        reaperFileName: entry.reaperFileName,
        previewWavFileName: entry.previewWavFileName,
        durationSeconds: entry.durationSeconds,
      };
      onUpsertGroup(group);
      onInsert(id, group.name);
      return;
    }
  };

  const renderSoundLabel = (soundName?: string) => {
    const fileName = soundName ? getSoundFileNameFromSoundName(soundName) ?? soundName : '';
    const folderName = soundName ? getNearestFolderNameFromSoundName(soundName) : null;
    return folderName ? `${fileName} / ${folderName}` : fileName;
  };

  const resolveDraftClipLabel = (clip: DraftClip) => {
    const byId = typeof clip.soundId === 'number' ? soundLibraryMapById.get(clip.soundId) : undefined;
    const byName = clip.soundName ? soundLibraryMapByName.get(clip.soundName) : undefined;
    return renderSoundLabel(byId?.name || byName?.name || clip.soundName);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[70] p-4">
      <audio ref={audioRef} className="hidden" />
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="text-xl font-semibold text-slate-100">插入音效组</h2>
          <button
            onClick={() => {
              stopPreview();
              onClose();
            }}
            className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
          >
            关闭
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow overflow-hidden">
          {/* Left: Insert */}
          <div className="bg-slate-900/40 rounded-md p-4 overflow-y-auto">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">1) 选择并插入</h3>

            <div className="bg-slate-800/40 rounded-md border border-slate-700 p-3">
              <div className="text-xs text-slate-400 mb-2">音效组库（Reaper 子工程 .rpp）</div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-slate-300">
                  库目录（扫描/试听）：{libraryRootHandle ? '已关联' : '未关联'}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSelectLibraryDirectory}
                    className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
                  >
                    选择目录
                  </button>
                  <button
                    onClick={handleClearLibraryDirectory}
                    className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
                  >
                    清除
                  </button>
                </div>
              </div>

              <div className="mt-3">
                <div className="text-xs text-slate-300 mb-1">库绝对路径（导出写入 RPP_PROJECT FILE）</div>
                <div className="flex items-center gap-2">
                  <input
                    value={libraryBasePath}
                    onChange={(e) => setLibraryBasePath(e.target.value)}
                    placeholder="例如：D:\\WDG\\SfxGroups"
                    className="flex-grow px-2 py-1.5 text-xs bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
                  />
                  <button
                    onClick={handleSaveLibraryBasePath}
                    className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 rounded text-white"
                  >
                    保存
                  </button>
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  提示：浏览器无法自动获取绝对路径，所以这里需要你手动填写。
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-300">库扫描</div>
                  <div className="text-xs text-slate-400">{isLibraryScanning ? '扫描中…' : `共 ${libraryGroups.length} 个 .rpp`}</div>
                </div>
                {libraryScanError && <div className="mt-2 text-xs text-red-300">扫描失败：{libraryScanError}</div>}
                <input
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  placeholder="搜索库音效组（按文件名）"
                  className="mt-2 w-full px-2 py-1.5 text-xs bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <select
                value={selectedInsertValue}
                onChange={(e) => setSelectedInsertValue(e.target.value)}
                className="flex-grow px-2 py-2 text-sm bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
              >
                <option value="" disabled>
                  {insertOptions.length > 0 ? '请选择音效组…' : '暂无可用音效组（先右侧创建或关联库目录）'}
                </option>
                {insertOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                onClick={handleInsertSelected}
                disabled={!selectedInsertValue}
                className="px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md disabled:opacity-50"
                title="插入到当前光标/选区起点"
              >
                插入
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-400">
              插入后会生成一个“音效组”标记（锚点）。导出到 Reaper 时：组合型会展开为多条音效；引用型会写入 RPP_PROJECT 的绝对路径引用。
            </p>

            {selectedInsert?.type === 'library' && (
              <div className="mt-4 bg-slate-800/40 rounded-md border border-slate-700 p-3">
                <div className="text-sm text-slate-200 font-medium truncate" title={selectedInsert.entry.name}>
                  【库】{selectedInsert.entry.name}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  文件：{selectedInsert.entry.reaperFileName}
                  {typeof selectedInsert.entry.durationSeconds === 'number'
                    ? `（${selectedInsert.entry.durationSeconds.toFixed(2)}s）`
                    : ''}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {selectedInsert.entry.previewWavFileName && (
                    <button
                      onClick={() =>
                        handlePreviewLibraryWav(
                          selectedInsert.entry.previewWavFileName as string,
                          `【库】${selectedInsert.entry.name}`,
                        )
                      }
                      className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
                    >
                      试听预览
                    </button>
                  )}
                  {audioPreview && (
                    <button
                      onClick={stopPreview}
                      className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
                    >
                      停止试听
                    </button>
                  )}
                  {isAudioPreviewLoading && <LoadingSpinner />}
                </div>
                <div className="mt-2 text-[11px] text-slate-400">
                  导出引用：{exportBasePath ? `${exportBasePath}\\${selectedInsert.entry.reaperFileName}` : '（未设置库绝对路径）'}
                </div>
              </div>
            )}

            {selectedInsert?.type === 'project' &&
              ((selectedInsert.group.kind || 'expanded') as SoundGroupKind) === 'reaperSubproject' && (
                <div className="mt-4 bg-slate-800/40 rounded-md border border-slate-700 p-3">
                  <div className="text-sm text-slate-200 font-medium truncate" title={selectedInsert.group.name}>
                    {selectedInsert.group.name}（子工程）
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    文件：{selectedInsert.group.reaperFileName || `${selectedInsert.group.name}.rpp`}
                    {typeof selectedInsert.group.durationSeconds === 'number' && isFinite(selectedInsert.group.durationSeconds)
                      ? `（${selectedInsert.group.durationSeconds.toFixed(2)}s）`
                      : ''}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {selectedInsert.group.previewWavFileName && (
                      <button
                        onClick={() =>
                          handlePreviewLibraryWav(
                            selectedInsert.group.previewWavFileName as string,
                            `预览：${selectedInsert.group.name}`,
                          )
                        }
                        className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
                      >
                        试听预览
                      </button>
                    )}
                    {audioPreview && (
                      <button
                        onClick={stopPreview}
                        className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
                      >
                        停止试听
                      </button>
                    )}
                    {isAudioPreviewLoading && <LoadingSpinner />}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">
                    导出引用：
                    {exportBasePath
                      ? `${exportBasePath}\\${selectedInsert.group.reaperFileName || `${selectedInsert.group.name}.rpp`}`
                      : '（未设置库绝对路径）'}
                  </div>
                </div>
              )}

            {audioPreview && (
              <div className="mt-3 text-xs text-slate-400 truncate" title={audioPreview.label}>
                正在试听：{audioPreview.label}
              </div>
            )}
          </div>

          {/* Right: Create/Edit */}
          <div className="bg-slate-900/40 rounded-md p-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">2) 创建/编辑音效组</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={resetDraftForNew}
                  className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
                >
                  新建
                </button>
                <button
                  onClick={handleDeleteCurrentGroup}
                  disabled={editingGroupId === '__new__'}
                  className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 rounded text-white disabled:opacity-50"
                >
                  删除
                </button>
                <button
                  onClick={handleSaveGroup}
                  className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 rounded text-white"
                >
                  保存
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 lg:grid-cols-5 gap-3">
              <div className="lg:col-span-2">
                <div className="text-xs text-slate-400 mb-2">音效组列表（点击加载编辑）</div>
                <div className="space-y-1">
                  {sortedGroups.length === 0 ? (
                    <div className="text-sm text-slate-500">暂无音效组。</div>
                  ) : (
                    sortedGroups.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => loadGroupIntoDraft(g.id)}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                          g.id === editingGroupId ? 'bg-sky-700 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-100'
                        }`}
                        title={g.name}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">
                            {g.name}
                            {((g.kind || 'expanded') as SoundGroupKind) === 'reaperSubproject' ? '（子）' : ''}
                          </span>
                          {usageCount(g.id) > 0 && (
                            <span className="text-xs text-slate-200/80 flex-shrink-0">已用 {usageCount(g.id)}</span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="lg:col-span-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">名称</label>
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="例如：进厨房"
                    className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => {
                      setDraftKind('reaperSubproject');
                      setDraftClips([]);
                      setSoundSearch('');
                    }}
                    className={`px-3 py-1.5 text-xs rounded ${
                      draftKind === 'reaperSubproject' ? 'bg-sky-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                    }`}
                  >
                    引用型（子工程 .rpp）
                  </button>
                  <button
                    onClick={() => {
                      setDraftKind('expanded');
                      setDraftDurationSeconds(undefined);
                    }}
                    className={`px-3 py-1.5 text-xs rounded ${
                      draftKind === 'expanded' ? 'bg-sky-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                    }`}
                  >
                    组合型（展开为多条音效）
                  </button>
                </div>

                {draftKind === 'reaperSubproject' ? (
                  <div className="mt-4 bg-slate-800/40 rounded-md border border-slate-700 p-3">
                    <div className="text-sm text-slate-200 font-medium">引用型（Reaper 子工程）</div>
                    <div className="mt-1 text-xs text-slate-400">
                      命名规则：<span className="font-mono">{expectedReaperFileName || '组名.rpp'}</span>
                      <span className="mx-2">预览：</span>
                      <span className="font-mono">{expectedPreviewWavFileName || '组名_preview.wav'}</span>
                    </div>

                    <div className="mt-3">
                      <label className="block text-xs text-slate-300 mb-1">预览时长（秒，可选）</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step={0.01}
                          value={typeof draftDurationSeconds === 'number' ? draftDurationSeconds : ''}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setDraftDurationSeconds(Number.isFinite(v) ? v : undefined);
                          }}
                          placeholder="可留空；也可从 *_preview.wav 自动读取"
                          className="flex-grow px-2 py-1.5 text-xs bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                        />
                        <button
                          onClick={handleAutofillDurationFromLibraryPreview}
                          className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
                          title="从音效组库目录里的 同名_preview.wav 读取时长"
                        >
                          从预览读取
                        </button>
                        {expectedPreviewWavFileName && (
                          <button
                            onClick={() =>
                              handlePreviewLibraryWav(
                                expectedPreviewWavFileName,
                                `预览：${(draftName || '').trim() || '音效组'}`,
                              )
                            }
                            className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
                            title="播放同名 *_preview.wav"
                          >
                            试听
                          </button>
                        )}
                        {isAudioPreviewLoading && <LoadingSpinner />}
                        {audioPreview && (
                          <button
                            onClick={stopPreview}
                            className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
                          >
                            停止
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 text-[11px] text-slate-400">
                      导出引用（绝对路径）：
                      {exportBasePath && expectedReaperFileName
                        ? `${exportBasePath}\\${expectedReaperFileName}`
                        : '（未设置库绝对路径或名称为空）'}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-slate-300 mb-1">添加音效（搜索并点击添加）</label>
                      <input
                        value={soundSearch}
                        onChange={(e) => setSoundSearch(e.target.value)}
                        placeholder="输入文件名/路径关键词，例如：door / 炒菜 / footsteps"
                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
                      />
                      {soundResults.length > 0 && (
                        <div className="mt-2 max-h-48 overflow-y-auto bg-slate-800 rounded-md border border-slate-700">
                          {soundResults.map((s) => (
                            <div key={s.id ?? s.name} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-700">
                              <div className="min-w-0">
                                <div className="text-sm truncate" title={s.name}>
                                  {renderSoundLabel(s.name)}
                                </div>
                                <div className="text-xs text-slate-400 truncate" title={s.name}>
                                  {s.name}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                  onClick={() => handlePreviewSound(s)}
                                  className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
                                >
                                  试听
                                </button>
                                <button
                                  onClick={() => handleAddSoundToDraft(s)}
                                  className="px-3 py-1.5 text-xs bg-sky-600 hover:bg-sky-700 rounded text-white"
                                >
                                  添加
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-slate-300">条目（可设置相对偏移）</h4>
                        {draftClips.length > 1 && (
                          <button
                            onClick={() => setDraftClips((prev) => [...prev].sort((a, b) => a.offsetSeconds - b.offsetSeconds))}
                            className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
                          >
                            按偏移排序
                          </button>
                        )}
                      </div>
                      {draftClips.length === 0 ? (
                        <div className="text-sm text-slate-500">暂无条目。</div>
                      ) : (
                        <div className="space-y-2">
                          {draftClips.map((c, idx) => (
                            <div
                              key={`${c.soundName || 'x'}_${idx}`}
                              className="flex items-center gap-2 bg-slate-800 rounded-md border border-slate-700 p-2"
                            >
                              <div className="flex-grow min-w-0">
                                <div className="text-sm truncate" title={c.soundName}>
                                  {resolveDraftClipLabel(c)}
                                </div>
                                <div className="text-xs text-slate-500 truncate" title={c.soundName}>
                                  {c.soundName}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-slate-400">偏移(s)</span>
                                  <input
                                    type="number"
                                    step={0.05}
                                    value={Number.isFinite(c.offsetSeconds) ? c.offsetSeconds : 0}
                                    onChange={(e) => {
                                      const v = parseFloat(e.target.value);
                                      setDraftClips((prev) =>
                                        prev.map((x, i) =>
                                          i === idx ? { ...x, offsetSeconds: Number.isFinite(v) ? v : 0 } : x,
                                        ),
                                      );
                                    }}
                                    className="w-24 px-2 py-1 text-sm bg-slate-700 text-slate-100 rounded border border-slate-600"
                                  />
                                </div>
                                <button
                                  onClick={() => setDraftClips((prev) => prev.filter((_, i) => i !== idx))}
                                  className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 rounded text-white"
                                >
                                  移除
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-400 flex-shrink-0">
          提示：组合型的“偏移”为相对锚点（插入点）的秒数；引用型的“时长”建议用同名预览 wav 自动读取。
        </div>
      </div>
    </div>
  );
};

export default SoundGroupModal;
