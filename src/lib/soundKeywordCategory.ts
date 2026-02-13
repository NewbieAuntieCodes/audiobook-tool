import type { SoundLibraryItem, SoundLibraryRoot } from '../types';
import { normalizeSoundPath } from './soundPath';

export const SOUND_KEYWORD_CATEGORY_ROOT_TOKEN = '__ROOT__';

export type SoundKeywordFolderScope = {
  root: SoundLibraryRoot;
  slotIndex: 0 | 1;
  folderName: string | null;
};

export const buildSoundKeywordCategoryKey = (
  root: SoundLibraryRoot,
  slotIndex: number,
  folderName: string | null,
): string => {
  const safeSlot = slotIndex === 1 ? 1 : 0;
  const slotKey = `${root}_${safeSlot + 1}`;
  const folderPart = folderName && folderName.trim() ? folderName.trim() : SOUND_KEYWORD_CATEGORY_ROOT_TOKEN;
  return `${slotKey}::${folderPart}`;
};

export const parseSoundKeywordCategoryKey = (key: string): SoundKeywordFolderScope | null => {
  const raw = (key || '').trim();
  const m = /^(music|sfx)_(1|2)::(.+)$/u.exec(raw);
  if (!m) return null;
  const root = m[1] as SoundLibraryRoot;
  const slotIndex = (Number.parseInt(m[2], 10) - 1) as 0 | 1;
  if (slotIndex !== 0 && slotIndex !== 1) return null;

  const folderPart = (m[3] || '').trim();
  if (!folderPart) return null;
  const folderName = folderPart === SOUND_KEYWORD_CATEGORY_ROOT_TOKEN ? null : folderPart;
  return { root, slotIndex, folderName };
};

const slotKeyForScope = (scope: SoundKeywordFolderScope): string => `${scope.root}_${scope.slotIndex + 1}`;

export const isSoundInKeywordFolderScope = (sound: SoundLibraryItem, scope: SoundKeywordFolderScope): boolean => {
  const slotKey = slotKeyForScope(scope);
  const category = (sound.category || '').trim();
  if (category !== slotKey) return false;

  const normalized = normalizeSoundPath(sound.name).trim();
  if (!normalized) return false;

  if (scope.folderName === null) {
    return !normalized.includes('/');
  }

  return normalized.startsWith(`${scope.folderName}/`);
};

