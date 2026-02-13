import React, { useEffect, useMemo, useState, useRef } from 'react';
import { TextMarker, SoundLibraryItem, SoundGroup } from '../../../types';
import { MagnifyingGlassIcon, MusicalNoteIcon, PlayIcon, PauseIcon } from '../../../components/ui/icons';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import { soundLibraryRepository } from '../../../repositories/soundLibraryRepository';
import { getNearestFolderNameFromSoundName, getSoundFileNameFromSoundName } from '../../../lib/soundPath';


interface EditMarkerModalProps {
  isOpen: boolean;
  marker: TextMarker | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onUpdateRangeFromSelection: (id: string) => void;
  onUpdateAnchorFromSelection: (id: string) => void;
  onUpdateColor: (id: string, color?: string) => void;
  soundLibrary: SoundLibraryItem[];
  soundGroups: SoundGroup[];
  onChangeSfxGroup: (markerId: string, groupId: string) => void;
}

const formatDuration = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
};


const EditMarkerModal: React.FC<EditMarkerModalProps> = ({ isOpen, marker, onClose, onDelete, onRename, onUpdateRangeFromSelection, onUpdateAnchorFromSelection, onUpdateColor, soundLibrary, soundGroups, onChangeSfxGroup }) => {
  const [name, setName] = useState('');
  const [useCustomColor, setUseCustomColor] = useState(false);
  const [colorHex, setColorHex] = useState('#fff9cc');
  const [alpha, setAlpha] = useState(0.46);

  // BGM Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SoundLibraryItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [previewAudio, setPreviewAudio] = useState<{ url: string; id: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (isOpen && marker) {
      setName(marker.name || '');
      if (marker.type === 'bgm') {
        setSearchTerm(marker.name || '');
        if (marker.color) {
            setUseCustomColor(true);
        } else {
            setUseCustomColor(false);
        }
      }
    } else {
      // Cleanup when closed
      setSearchTerm('');
      setSearchResults([]);
      if (previewAudio) {
        URL.revokeObjectURL(previewAudio.url);
      }
      setPreviewAudio(null);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
      }
    }
  }, [isOpen, marker]);

    // Debounced search logic for BGM
  useEffect(() => {
    if (marker?.type !== 'bgm' || !searchTerm) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const handler = setTimeout(() => {
        const musicAndAmbience = soundLibrary.filter((s) => {
            const cat = (s.category || '').toLowerCase();
            return cat.startsWith('music') || cat.startsWith('ambience');
        });
        const results = musicAndAmbience.filter(sound =>
            sound.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setSearchResults(results);
        setIsSearching(false);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm, soundLibrary, marker?.type]);

  // Audio preview playback logic
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    let currentUrl: string | null = null;
    
    if (previewAudio) {
        currentUrl = previewAudio.url;
        audio.src = currentUrl;
        audio.play().catch(e => console.error("Audio play failed", e));
    } else {
        audio.pause();
        audio.removeAttribute('src');
    }

    const handleEnded = () => setPreviewAudio(null);
    const handlePause = () => {
      if (previewAudio && audio.paused) {
        setPreviewAudio(null);
      }
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [previewAudio]);

  const handlePreview = async (sound: SoundLibraryItem) => {
    if (!sound.id) return;
    if (previewAudio?.id === sound.id) {
        setPreviewAudio(null);
        return;
    }
    
    if (previewAudio) {
        URL.revokeObjectURL(previewAudio.url);
    }
    
    try {
      const file = await soundLibraryRepository.getSoundFile(sound, { requestPermission: true, allowRootResolve: true });
      const url = URL.createObjectURL(file);
      setPreviewAudio({ url, id: sound.id });
    } catch (e) {
      console.error("Error getting file for preview:", e);
      const name = e instanceof Error ? e.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        alert('需要授权读取文件/文件夹权限，才能预览。');
      } else if (name === 'NotFoundError') {
        alert('找不到该文件，可能已被移动/删除。请在音效库里点击“更新”重新扫描。');
      } else {
        alert('无法预览该文件。');
      }
    }
  };


  const rgbaFromHex = (hex: string, a: number) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return undefined;
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  if (!isOpen || !marker) return null;

  const saveRename = () => {
    const newName = name.trim();
    if (newName) {
        onRename(marker.id, newName);
    } else {
        alert("名称不能为空。");
    }
  };
  const saveColor = () => {
    if (marker.type !== 'bgm') return;
    const color = useCustomColor ? rgbaFromHex(colorHex, alpha) : undefined;
    onUpdateColor(marker.id, color);
  };
  
  const isBgmType = marker.type === 'bgm';
  const isSceneType = marker.type === 'scene';
  const isSfxGroupType = marker.type === 'sfxGroup';

  const BGMEditor = (
     <div className="space-y-4">
        <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">智能搜索音效库</label>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" />
                </div>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="输入关键词搜索音乐..."
                    className="w-full p-2 pl-10 bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
                />
            </div>
        </div>

        <div className="min-h-[10rem] max-h-48 bg-slate-900/50 rounded-md p-2 flex flex-col overflow-y-auto">
            {isSearching ? (
                <div className="flex-grow flex items-center justify-center"><LoadingSpinner/></div>
            ) : searchResults.length > 0 ? (
                <ul className="space-y-1">
                    {searchResults.map(sound => {
                        const fileName = getSoundFileNameFromSoundName(sound.name) ?? sound.name;
                        const folderName = getNearestFolderNameFromSoundName(sound.name);
                        const displayName = folderName ? `${fileName} / ${folderName}` : fileName;

                        return (
                            <li key={sound.id} className="group flex items-center justify-between p-2 rounded-md hover:bg-slate-700 transition-colors">
                                <div className="flex items-center cursor-pointer flex-grow min-w-0" onClick={() => setName(sound.name)}>
                                    <MusicalNoteIcon className="w-4 h-4 mr-3 text-sky-400 flex-shrink-0" />
                                    <span className="text-sm truncate" title={sound.name}>{displayName}</span>
                                </div>
                                <div className="flex items-center space-x-2 flex-shrink-0 ml-4">
                                    <span className="text-xs text-slate-400 font-mono">{formatDuration(sound.duration)}</span>
                                    <button onClick={() => handlePreview(sound)} className="p-1.5 rounded-full bg-slate-600 group-hover:bg-sky-600 text-white">
                                        {previewAudio?.id === sound.id ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            ) : searchTerm ? (
                <div className="flex-grow flex items-center justify-center text-sm text-slate-500">在“音乐”或“环境音”中未找到匹配项。</div>
            ) : (
                 <div className="flex-grow flex items-center justify-center text-sm text-slate-500">无搜索结果</div>
            )}
        </div>
        <div className="border-t border-slate-700 pt-4">
          <label className="block text-sm font-medium text-slate-300 mb-1">名称</label>
            <div className="flex gap-2">
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="flex-grow p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
                />
                <button className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded text-slate-200" onClick={saveRename}>保存名称</button>
            </div>
        </div>
        <div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={useCustomColor} onChange={(e) => setUseCustomColor(e.target.checked)} />
            使用自定义颜色
          </label>
          {useCustomColor && (
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">颜色</span>
                <input type="color" value={colorHex} onChange={e => setColorHex(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">透明度</span>
                <input type="range" min={0.2} max={0.8} step={0.01} value={alpha} onChange={e => setAlpha(parseFloat(e.target.value))} />
                <span className="text-xs text-slate-400">{Math.round(alpha*100)}%</span>
              </div>
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <button className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded text-slate-200" onClick={saveColor}>保存颜色</button>
          </div>
        </div>
     </div>
   );

  const SceneEditor = (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">名称</label>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
      />
      <div className="mt-2 flex gap-2">
        <button className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded text-slate-200" onClick={saveRename}>保存名称</button>
      </div>
    </div>
  );

  const SfxGroupEditor = (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">音效组</label>
      <select
        value={marker.groupId || ''}
        onChange={(e) => onChangeSfxGroup(marker.id, e.target.value)}
        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
      >
        <option value="" disabled>
          {soundGroups.length > 0 ? '请选择…' : '暂无音效组（先创建音效组）'}
        </option>
        {soundGroups
          .slice()
          .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hans-CN'))
          .map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
      </select>
      <div className="mt-2 text-xs text-slate-400">
        这是“短时事件包”：导出到 Reaper 时会展开为多条音效片段（按相对偏移）。
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] p-4">
      <audio ref={audioRef} />
      <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <h2 className="text-xl font-semibold text-slate-100 mb-4 flex-shrink-0">
          编辑{marker.type === 'scene' ? '场景' : marker.type === 'sfxGroup' ? '音效组' : marker.type === 'bgm' ? '背景音乐' : '标记'}
        </h2>

        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
          {isBgmType ? BGMEditor : isSceneType ? SceneEditor : isSfxGroupType ? SfxGroupEditor : SceneEditor}
        </div>
        
        <div className="border-t border-slate-700 pt-4 mt-4 flex-shrink-0">
          <div className="text-xs text-slate-400 mb-2">
            {isSfxGroupType ? '想移动插入点？先在正文里重新点击定位/框选，再点击“用当前选区更新插入点”。' : '想调范围？先在正文里重新框选，再点击“用当前选区更新范围”。'}
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded text-slate-200"
              onClick={() => (isSfxGroupType ? onUpdateAnchorFromSelection(marker.id) : onUpdateRangeFromSelection(marker.id))}
            >
              {isSfxGroupType ? '用当前选区更新插入点' : '用当前选区更新范围'}
            </button>
            <button className="ml-auto px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 rounded text-white" onClick={() => onDelete(marker.id)}>删除标记</button>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4 flex-shrink-0">
          <button className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded text-slate-200" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
};

export default EditMarkerModal;
