import React, { useState, useCallback, useRef } from 'react';
import { Project, PresetColor } from '../../types';
import BookCard from './components/BookCard';
import { BookOpenIcon, UploadIcon, PaletteIcon, XMarkIcon, SaveIcon, ArrowPathIcon } from '../../components/ui/icons';
import useStore from '../../store/useStore';
import CollaboratorModal from './components/CollaboratorModal';
import { isHexColor, getContrastingTextColor } from '../../lib/colorUtils';
import { tailwindToHex } from '../../lib/tailwindColorMap';
import { defaultCvPresetColors, defaultCharacterPresetColors } from '../../lib/colorPresets';
import { internalParseScriptToChapters } from '../../lib/scriptParser';
import { parseChaptersPatchJson } from '../scriptEditor/services/chaptersPatch';
import type { ChaptersPatchV1 } from '../scriptEditor/services/chaptersPatch';
import type { Character, ScriptLine } from '../../types';
import { characterRepository } from '../../repositories';
import { normalizeCharacterNameKey } from '../../lib/characterName';

// --- In-file Component: Editable Preset Color Item --- //
const EditablePresetColor: React.FC<{
  preset: PresetColor;
  onUpdate: (updates: Partial<PresetColor>) => void;
  idPrefix: string;
}> = ({ preset, onUpdate, idPrefix }) => {
  const { name, bgColorClass, textColorClass } = preset;

  const previewStyle: React.CSSProperties = isHexColor(bgColorClass)
    ? { backgroundColor: bgColorClass, color: isHexColor(textColorClass) ? textColorClass : getContrastingTextColor(bgColorClass) }
    : {};
  const previewClassName = !isHexColor(bgColorClass) ? `${bgColorClass} ${textColorClass}` : '';

  const getColorAsHex = (colorValue: string, fallback: string): string => {
    if (isHexColor(colorValue)) {
      return colorValue;
    }
    return tailwindToHex[colorValue] || fallback;
  };

  const bgColorPickerValue = getColorAsHex(bgColorClass, '#ffffff');
  const textColorPickerValue = getColorAsHex(textColorClass, '#000000');

  const handleBgColorPickerChange = (e: React.FormEvent<HTMLInputElement>) => {
    const newHex = e.currentTarget.value;
    onUpdate({
      bgColorClass: newHex,
      textColorClass: getContrastingTextColor(newHex),
    });
  };

  const handleTextColorPickerChange = (e: React.FormEvent<HTMLInputElement>) => {
    onUpdate({ textColorClass: e.currentTarget.value });
  };

  return (
    <div className="p-2 bg-slate-800 rounded-md border border-slate-700 space-y-2">
      <div className={`p-2 h-10 rounded text-center font-bold flex items-center justify-center ${previewClassName}`} style={previewStyle}>
        Aa
      </div>
      <div className="flex justify-around items-center">
        <input
          id={`bg-color-${idPrefix}`}
          type="color"
          value={bgColorPickerValue}
          onInput={handleBgColorPickerChange}
          className="p-0 h-7 w-10 rounded border-2 border-slate-600 bg-slate-700 cursor-pointer"
          aria-label={`Background color for ${name}`}
          title="背景颜色"
        />
        <input
          id={`text-color-${idPrefix}`}
          type="color"
          value={textColorPickerValue}
          onInput={handleTextColorPickerChange}
          className="p-0 h-7 w-10 rounded border-2 border-slate-600 bg-slate-700 cursor-pointer"
          aria-label={`Text color for ${name}`}
          title="文本颜色"
        />
      </div>
      <input
        type="text"
        value={name}
        onChange={e => onUpdate({ name: e.target.value })}
        className="w-full p-1.5 text-xs bg-slate-700 text-slate-100 rounded border border-slate-600 focus:ring-sky-500"
        placeholder="名称"
        aria-label={`Preset name for ${name}`}
      />
    </div>
  );
};

// --- In-file Component: Color Preset Manager Modal --- //
const ColorPresetManagerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const initialCvPresets = useStore(state => state.cvColorPresets);
  const initialCharPresets = useStore(state => state.characterColorPresets);
  const updateCvPresets = useStore(state => state.updateCvColorPresets);
  const updateCharPresets = useStore(state => state.updateCharacterColorPresets);

  const [editedCvPresets, setEditedCvPresets] = useState<PresetColor[]>([]);
  const [editedCharPresets, setEditedCharPresets] = useState<PresetColor[]>([]);

  React.useEffect(() => {
    if (isOpen) {
      setEditedCvPresets(JSON.parse(JSON.stringify(initialCvPresets)));
      setEditedCharPresets(JSON.parse(JSON.stringify(initialCharPresets)));
    }
  }, [isOpen, initialCvPresets, initialCharPresets]);

  const handleCvUpdate = (index: number, updates: Partial<PresetColor>) => {
    setEditedCvPresets(prevPresets => {
      const newPresets = [...prevPresets];
      newPresets[index] = { ...newPresets[index], ...updates };
      return newPresets;
    });
  };
  const handleCharUpdate = (index: number, updates: Partial<PresetColor>) => {
    setEditedCharPresets(prevPresets => {
        const newPresets = [...prevPresets];
        newPresets[index] = { ...newPresets[index], ...updates };
        return newPresets;
    });
  };

  const handleSave = async () => {
    await updateCvPresets(editedCvPresets);
    await updateCharPresets(editedCharPresets);
    onClose();
  };

  const handleReset = () => {
    setEditedCvPresets(JSON.parse(JSON.stringify(initialCvPresets)));
    setEditedCharPresets(JSON.parse(JSON.stringify(initialCharPresets)));
  };

  const handleResetToSystemDefaults = () => {
    setEditedCvPresets(JSON.parse(JSON.stringify(defaultCvPresetColors)));
    setEditedCharPresets(JSON.parse(JSON.stringify(defaultCharacterPresetColors)));
  };

  if (!isOpen) return null;

  const cvPresetCount = editedCvPresets.length || initialCvPresets.length;
  const charPresetCount = editedCharPresets.length || initialCharPresets.length;
  const cvPresetRows = cvPresetCount > 0 ? Math.ceil(cvPresetCount / 8) : 0;
  const charPresetRows = charPresetCount > 0 ? Math.ceil(charPresetCount / 8) : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[100] p-4">
      <div className="bg-slate-850 p-6 rounded-lg shadow-xl w-full max-w-5xl h-[90vh] flex flex-col border border-slate-700">
        <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-700 flex-shrink-0">
          <h2 className="text-2xl font-semibold text-slate-100">颜色预设管理器</h2>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-white"><XMarkIcon /></button>
        </div>

        <div className="flex-grow overflow-y-auto pr-2 grid grid-cols-1 gap-8">
          <section>
            <h3 className="text-lg font-medium text-teal-400 sticky top-0 bg-slate-850 py-2">CV 预设颜色 ({cvPresetRows}排，共{cvPresetCount}个)</h3>
            <div className="grid grid-cols-8 gap-3">
              {editedCvPresets.map((preset, index) => (
                <EditablePresetColor key={`cv-${index}`} preset={preset} onUpdate={(updates) => handleCvUpdate(index, updates)} idPrefix={`cv-${index}`} />
              ))}
            </div>
          </section>
          <section>
            <h3 className="text-lg font-medium text-rose-400 sticky top-0 bg-slate-850 py-2">角色 预设颜色 ({charPresetRows}排，共{charPresetCount}个)</h3>
            <div className="grid grid-cols-8 gap-3">
              {editedCharPresets.map((preset, index) => (
                <EditablePresetColor key={`char-${index}`} preset={preset} onUpdate={(updates) => handleCharUpdate(index, updates)} idPrefix={`char-${index}`} />
              ))}
            </div>
          </section>
        </div>

        <div className="flex justify-between items-center pt-4 mt-4 border-t border-slate-700 flex-shrink-0">
          <p className="text-xs text-slate-500">提示：颜色选择实时同步，名称在输入框失焦后自动保存。</p>
          <div className="flex space-x-3">
            <button onClick={handleReset} className="flex items-center px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-md">
                <ArrowPathIcon className="w-4 h-4 mr-2" /> 撤销本次修改
            </button>
            <button onClick={handleResetToSystemDefaults} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-purple-700 hover:bg-purple-600 rounded-md">
                <ArrowPathIcon className="w-4 h-4 mr-2" /> 恢复系统默认
            </button>
            <button onClick={handleSave} className="flex items-center px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md">
                <SaveIcon className="w-4 h-4 mr-2" /> 保存并关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


const DashboardPage: React.FC = () => {
  const { 
    projects, 
    updateProject, 
    deleteProject, 
    navigateTo, 
    setSelectedProjectId,
    appendChaptersToProject,
    openConfirmModal,
    selectedProjectId
  } = useStore();

  const sortedProjects = [...projects].sort((a, b) => b.lastModified - a.lastModified);
  const addCollaboratorToProject = useStore(state => state.addCollaboratorToProject);
  
  const [projectToManage, setProjectToManage] = useState<Project | null>(null);
  const [isColorPresetModalOpen, setIsColorPresetModalOpen] = useState(false);
  const importProjectInputRef = useRef<HTMLInputElement>(null);

  const addCharacter = useStore(state => state.addCharacter);

  const handleOpenCollaboratorsModal = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setProjectToManage(project);
    }
  };

  const handleCloseCollaboratorsModal = () => {
    setProjectToManage(null);
  };
  
  const handleOpenEditor = (projectId: string) => {
    setSelectedProjectId(projectId);
    navigateTo("editor");
  };

  const handleDeleteProject = (projectId: string) => {
    openConfirmModal(
      "删除项目确认",
      `您确定要删除项目吗？此操作无法撤销。`,
      () => {
        const currentProjects = useStore.getState().projects;
        const currentSelectedId = useStore.getState().selectedProjectId;
        
        deleteProject(projectId); 
        
        if (currentSelectedId === projectId && currentProjects.length <= 1) {
            navigateTo("upload"); 
        }
      },
      "删除",
      "取消"
    );
  };
  
  const handleContinueUpload = useCallback(async (projectId: string, file: File) => {
    if (!file) return;

    try {
      const rawText = await file.text();
      if (!rawText.trim()) {
        alert("上传的文件为空。");
        return;
      }
      
      const project = projects.find(p => p.id === projectId);
      if (!project) {
        alert("未找到项目。");
        return;
      }

      const newChapters = internalParseScriptToChapters(rawText, project.name);

      if (newChapters.length > 0) {
        appendChaptersToProject(projectId, newChapters);
        alert(`成功为项目 "${project.name}" 添加了 ${newChapters.length} 个新章节。`);
      } else {
        alert("在上传的文件中未检测到新的章节。请检查文件格式。");
      }
    } catch (error) {
      console.error("处理续传文件时出错:", error);
      alert(`处理文件时出错: ${error instanceof Error ? error.message : "未知错误"}`);
    }
  }, [projects, appendChaptersToProject]);

  const ensureLineBooleans = (line: Partial<ScriptLine>): ScriptLine => {
    return {
      id: String(line.id || `line_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
      text: String(line.text || ''),
      originalText: line.originalText,
      characterId: line.characterId,
      audioBlobId: undefined,
      isAiAudioLoading: false,
      isAiAudioSynced: false,
      isTextModifiedManual: Boolean(line.isTextModifiedManual),
      soundType: line.soundType,
      emotion: line.emotion,
      isMarkedForReturn: line.isMarkedForReturn,
      feedback: line.feedback,
      postSilence: line.postSilence,
      ignoredSoundKeywords: line.ignoredSoundKeywords,
      pinnedSounds: line.pinnedSounds,
    };
  };

  const upsertCharactersFromPatch = async (projectId: string, patch: ChaptersPatchV1) => {
    const state = useStore.getState();
    const normalizeName = (name: string) => normalizeCharacterNameKey(name);

    const projectChars = state.characters.filter((c) => c.projectId === projectId && c.status !== 'merged');
    const byName = new Map<string, Character>();
    projectChars.forEach((c) => byName.set(normalizeName(c.name), c));

    const updatedExisting: Character[] = [];

    // 1) Upsert characters included in patch metadata (preserve colors/description)
    for (const meta of patch.characters) {
      const key = normalizeName(meta.name);
      const existing = byName.get(key);
      if (existing) {
        const next: Character = {
          ...existing,
          color: meta.color,
          textColor: meta.textColor,
          cvName: meta.cvName,
          description: meta.description,
          isStyleLockedToCv: meta.isStyleLockedToCv ?? existing.isStyleLockedToCv,
        };
        updatedExisting.push(next);
        byName.set(key, next);
      } else {
        const created = addCharacter(
          {
            name: meta.name,
            color: meta.color,
            textColor: meta.textColor,
            cvName: meta.cvName,
            description: meta.description,
            isStyleLockedToCv: meta.isStyleLockedToCv,
          },
          projectId,
        );
        byName.set(key, created);
      }
    }

    // 2) Ensure any characterName referenced by lines exists (fallback)
    const neededNames = new Set<string>();
    patch.chapters.forEach((ch) =>
      ch.scriptLines.forEach((l) => {
        const name = (l.characterName || '').trim();
        if (name) neededNames.add(name);
      }),
    );

    for (const name of neededNames) {
      const key = normalizeName(name);
      if (byName.has(key)) continue;
      const created = addCharacter(
        {
          name,
          color: 'bg-slate-600',
          textColor: 'text-slate-100',
          cvName: '',
          description: '',
          isStyleLockedToCv: false,
        },
        projectId,
      );
      byName.set(key, created);
    }

    if (updatedExisting.length > 0) {
      await characterRepository.bulkUpdate(updatedExisting);
      // Update Zustand state for existing character updates
      const updatedIds = new Set(updatedExisting.map((c) => c.id));
      useStore.setState((prev) => ({
        characters: prev.characters.map((c) => (updatedIds.has(c.id) ? updatedExisting.find((u) => u.id === c.id)! : c)),
      }));
    }

    return byName;
  };

  const applyPatchToProject = async (targetProjectId: string, patch: ChaptersPatchV1) => {
    const state = useStore.getState();
    const existing = state.projects.find((p) => p.id === targetProjectId);

    // Ensure project exists (create with same projectId so "同一个项目"成立)
    if (!existing) {
      const newProject: Project = {
        id: targetProjectId,
        name: patch.source.projectName || '导入项目',
        chapters: [],
        status: 'in-progress',
        mainCategory: '',
        subCategory: '',
        lastModified: Date.now(),
        cvStyles: patch.projectMeta?.cvStyles || {},
        customSoundTypes: patch.projectMeta?.customSoundTypes || [],
      };
      await useStore.getState().addProject(newProject);
    }

    const afterCreateState = useStore.getState();
    const project = afterCreateState.projects.find((p) => p.id === targetProjectId);
    if (!project) throw new Error('创建/定位项目失败');

    // Ensure/Upsert characters first, then map lines to characterId
    const charByName = await upsertCharactersFromPatch(targetProjectId, patch);
    const normalizeName = (name: string) => normalizeCharacterNameKey(name);
    const unknownId =
      charByName.get(normalizeName('待识别角色'))?.id ||
      charByName.get(normalizeName('narrator'))?.id ||
      '';

    const incomingChapters = patch.chapters.map((incoming) => {
      const mappedLines: ScriptLine[] = (incoming.scriptLines || []).map((ls) => {
        const name = (ls.characterName || '').trim();
        const mappedCharId = name ? charByName.get(normalizeName(name))?.id : unknownId;
        const base: Partial<ScriptLine> = {
          id: ls.id,
          text: ls.text,
          originalText: ls.originalText,
          characterId: mappedCharId,
          soundType: ls.soundType,
          emotion: ls.emotion,
          isTextModifiedManual: ls.isTextModifiedManual,
          isMarkedForReturn: ls.isMarkedForReturn,
          feedback: ls.feedback,
          postSilence: ls.postSilence,
          ignoredSoundKeywords: ls.ignoredSoundKeywords,
          pinnedSounds: ls.pinnedSounds,
        };
        return ensureLineBooleans(base);
      });

      return {
        id: incoming.id,
        title: incoming.title,
        rawContent: (incoming.rawContent || '').trim() ? incoming.rawContent : mappedLines.map((l) => l.text).join('\n'),
        scriptLines: mappedLines,
      };
    });

    const existingChapterIds = new Set(project.chapters.map((c) => c.id));
    const duplicates = incomingChapters.filter((ch) => existingChapterIds.has(ch.id));

    const doMerge = async (replaceDuplicates: boolean) => {
      const chaptersToReplace = new Map<string, typeof incomingChapters[number]>();
      const chaptersToAppend: typeof incomingChapters = [];

      for (const ch of incomingChapters) {
        if (existingChapterIds.has(ch.id)) {
          if (replaceDuplicates) chaptersToReplace.set(ch.id, ch);
        } else {
          chaptersToAppend.push(ch);
        }
      }

      const nextProject: Project = {
        ...project,
        // Only set meta if current project is missing them; avoid surprising overwrites
        cvStyles: Object.keys(project.cvStyles || {}).length > 0 ? project.cvStyles : patch.projectMeta?.cvStyles || project.cvStyles,
        customSoundTypes:
          (project.customSoundTypes && project.customSoundTypes.length > 0)
            ? project.customSoundTypes
            : patch.projectMeta?.customSoundTypes || project.customSoundTypes,
        chapters: [...project.chapters.map((c) => chaptersToReplace.get(c.id) || c), ...chaptersToAppend],
        lastModified: Date.now(),
      };

      await useStore.getState().updateProject(nextProject);
      useStore.getState().setSelectedProjectId(targetProjectId);
      alert(`导入完成：新增 ${chaptersToAppend.length} 章，替换 ${chaptersToReplace.size} 章。`);
    };

    if (duplicates.length > 0) {
      openConfirmModal(
        '发现重复章节',
        `有 ${duplicates.length} 个章节ID已存在。选择“覆盖”会用导入内容替换这些章节；选择“跳过”则仅追加新章节。`,
        () => void doMerge(true),
        '覆盖重复',
        '跳过重复',
        () => void doMerge(false),
      );
      return;
    }

    await doMerge(false);
  };

  const handleImportSyncFile = async (file: File) => {
    let patch: ChaptersPatchV1;
    try {
      patch = parseChaptersPatchJson(await file.text());
    } catch (e) {
      alert(`导入失败：${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    const targetProjectId = patch.source.projectId;
    const state = useStore.getState();
    const existing = state.projects.find((p) => p.id === targetProjectId);

    if (existing) {
      openConfirmModal(
        '导入到现有项目',
        `检测到本机已有同ID项目：“${existing.name}”。确认后将把补丁章节合并进去。`,
        () => void applyPatchToProject(targetProjectId, patch),
        '继续导入',
        '取消',
      );
      return;
    }

    await applyPatchToProject(targetProjectId, patch);
  };

  return (
    <div className="p-4 md:p-6 bg-slate-900 h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-sky-400">我的项目</h1>
        <div className="flex items-center space-x-3">
            <button
              onClick={() => importProjectInputRef.current?.click()}
              className="flex items-center px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white font-semibold rounded-md text-sm transition-colors"
              aria-label="导入同步文件"
              title="导入章节补丁 JSON；若本机没有该项目，会自动创建同 projectId 的项目"
            >
              <ArrowPathIcon className="w-4 h-4 mr-2" /> 导入同步
            </button>
            <button
              onClick={() => setIsColorPresetModalOpen(true)}
              className="flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-md text-sm transition-colors"
              aria-label="颜色预设"
            >
              <PaletteIcon className="w-4 h-4 mr-2" /> 颜色预设
            </button>
            <button
              onClick={() => navigateTo("upload")}
              className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md text-sm transition-colors"
              aria-label="上传新书"
            >
              <UploadIcon className="w-4 h-4 mr-2" /> 上传新书
            </button>
            <input
              ref={importProjectInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImportSyncFile(f);
                e.currentTarget.value = '';
              }}
            />
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="pt-10 flex flex-col items-center justify-center text-center text-slate-100">
          <BookOpenIcon className="w-20 h-20 text-slate-600 mb-6" />
          <h2 className="text-2xl font-semibold text-slate-300 mb-2">尚无项目</h2>
          <p className="text-slate-400 mb-6">上传您的第一份文稿以开始创作。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
          {sortedProjects.map(project => (
            <BookCard
              key={project.id}
              project={project}
              onOpenEditor={handleOpenEditor}
              onUpdateProject={updateProject}
              onDeleteProject={handleDeleteProject}
              onOpenCollaborators={handleOpenCollaboratorsModal}
              onContinueUpload={handleContinueUpload}
            />
          ))}
        </div>
      )}
       <CollaboratorModal
        isOpen={!!projectToManage}
        onClose={handleCloseCollaboratorsModal}
        project={projectToManage}
        onAddCollaborator={addCollaboratorToProject}
      />
      <ColorPresetManagerModal
        isOpen={isColorPresetModalOpen}
        onClose={() => setIsColorPresetModalOpen(false)}
      />
    </div>
  );
};

export default DashboardPage;
