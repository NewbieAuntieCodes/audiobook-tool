import type { SoundLibraryRoot } from '../types';

export type SoundLibraryCategoryDef = {
  key: string;
  name: string;
  root: SoundLibraryRoot;
};

export const SOUND_LIBRARY_CATEGORY_DEFS: SoundLibraryCategoryDef[] = [
  { key: 'music1', name: '音乐1', root: 'music' },
  { key: 'music2', name: '音乐2', root: 'music' },
  { key: 'ambience1', name: '环境音1', root: 'music' },
  { key: 'ambience2', name: '环境音2', root: 'music' },
  { key: 'footsteps', name: '脚步声', root: 'sfx' },
  { key: 'fabric', name: '布料', root: 'sfx' },
  { key: 'doors_windows', name: '门窗', root: 'sfx' },
  { key: 'transportation', name: '交通', root: 'sfx' },
  { key: 'horror', name: '恐怖音效', root: 'sfx' },
  { key: 'suspense', name: '悬疑音效', root: 'sfx' },
  { key: 'fighting', name: '打斗音效', root: 'sfx' },
  { key: 'firearms', name: '热武器音效', root: 'sfx' },
  { key: 'variety', name: '综艺音效', root: 'sfx' },
  { key: 'fantasy', name: '玄幻音效', root: 'sfx' },
  { key: 'sci_fi', name: '科幻音效', root: 'sfx' },
  { key: 'animals', name: '动物', root: 'sfx' },
  { key: 'other_sfx', name: '其它音效', root: 'sfx' },
];

const CATEGORY_MAP = new Map<string, SoundLibraryCategoryDef>(
  SOUND_LIBRARY_CATEGORY_DEFS.map((def) => [def.key, def])
);

export const getSoundLibraryCategoryDef = (key: string): SoundLibraryCategoryDef | null => {
  return CATEGORY_MAP.get(key) || null;
};

export const inferSoundLibraryRootFromCategory = (categoryKey: string): SoundLibraryRoot => {
  const def = getSoundLibraryCategoryDef(categoryKey);
  if (def) return def.root;
  if (categoryKey.startsWith('music') || categoryKey.startsWith('ambience')) return 'music';
  return 'sfx';
};

export const findCategoryFolder = (
  folders: FileSystemDirectoryHandle[],
  def: Pick<SoundLibraryCategoryDef, 'key' | 'name'>
): FileSystemDirectoryHandle | null => {
  const exactByName = folders.find((h) => h.name === def.name);
  if (exactByName) return exactByName;
  const exactByKey = folders.find((h) => h.name === def.key);
  if (exactByKey) return exactByKey;
  const byNameContains = folders.find((h) => h.name.includes(def.name));
  if (byNameContains) return byNameContains;
  const byKeyContains = folders.find((h) => h.name.includes(def.key));
  if (byKeyContains) return byKeyContains;
  return null;
};

