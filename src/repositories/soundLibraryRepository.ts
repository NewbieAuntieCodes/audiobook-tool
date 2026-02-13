/**
 * 音效库数据操作层 (Sound Library Repository)
 *
 * 职责：
 * - 统一管理音效库相关的数据库操作
 * - 存储和检索文件夹句柄
 * - 存储、检索和删除音效文件信息
 */

import { db } from '../db';
import { SoundLibraryItem, SoundLibraryRoot, SoundLibraryRootHandleMap } from '../types';
import { ensureHandlePermission, getFileFromHandle } from '../lib/fileSystemAccess';
import { findCategoryFolder, getSoundLibraryCategoryDef, inferSoundLibraryRootFromCategory } from '../lib/soundLibraryCategories';

type SoundFileOptions = {
  requestPermission?: boolean;
  allowRootResolve?: boolean;
};

const normalizeRelativePath = (value: string): string => {
  return (value || '').replace(/\\/g, '/').replace(/^\/+/, '');
};

const getFileHandleByPath = async (
  baseDir: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemFileHandle> => {
  const normalized = normalizeRelativePath(relativePath);
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) {
    throw new Error('Empty sound file path');
  }

  const fileName = parts.pop()!;
  let currentDir = baseDir;
  for (const part of parts) {
    currentDir = await currentDir.getDirectoryHandle(part, { create: false });
  }
  return currentDir.getFileHandle(fileName, { create: false });
};

const listSubdirectories = async (
  rootHandle: FileSystemDirectoryHandle
): Promise<FileSystemDirectoryHandle[]> => {
  const folders: FileSystemDirectoryHandle[] = [];
  for await (const entry of rootHandle.values()) {
    if (entry.kind === 'directory') folders.push(entry as FileSystemDirectoryHandle);
  }
  return folders;
};

const resolveFileHandleFromRoots = async (
  sound: SoundLibraryItem,
  rootHandles: SoundLibraryRootHandleMap,
  requestPermission: boolean
): Promise<FileSystemFileHandle | null> => {
  const categoryKey = sound.category;

  const parseRootSlot = (category: string): { root: SoundLibraryRoot; slotIndex: number | null } => {
    const raw = (category || '').trim().toLowerCase();
    const root = raw.startsWith('music') ? 'music' : raw.startsWith('sfx') ? 'sfx' : inferSoundLibraryRootFromCategory(category);
    const m = /_(\d+)$/u.exec(raw);
    if (!m) return { root, slotIndex: null };
    const n = Number.parseInt(m[1], 10);
    if (!Number.isFinite(n) || n < 1 || n > 2) return { root, slotIndex: null };
    return { root, slotIndex: n - 1 };
  };

  // Plan A: category like music_1 / sfx_2; sound.name is relative path from root folder
  const { root, slotIndex } = parseRootSlot(categoryKey);
  const roots = rootHandles[root] || [];

  const preferredRoots: Array<FileSystemDirectoryHandle | null> =
    slotIndex !== null ? [roots[slotIndex] ?? null] : roots;

  for (const rootHandle of preferredRoots) {
    if (!rootHandle || rootHandle.kind !== 'directory') continue;

    const ok = await ensureHandlePermission(rootHandle as any, 'read', requestPermission);
    if (!ok) continue;

    try {
      return await getFileHandleByPath(rootHandle, sound.name);
    } catch {
      continue;
    }
  }

  // Backward compatibility: old schema stored "category folder + relative path within it"
  const def = getSoundLibraryCategoryDef(categoryKey);
  if (!def) return null;

  const legacyRoots = rootHandles[def.root] || [];
  for (const legacyRoot of legacyRoots) {
    if (!legacyRoot || legacyRoot.kind !== 'directory') continue;

    const ok = await ensureHandlePermission(legacyRoot as any, 'read', requestPermission);
    if (!ok) continue;

    try {
      const folders = await listSubdirectories(legacyRoot);
      const categoryFolder = findCategoryFolder(folders, def);
      if (!categoryFolder) continue;

      const categoryOk = await ensureHandlePermission(categoryFolder as any, 'read', requestPermission);
      if (!categoryOk) continue;

      return await getFileHandleByPath(categoryFolder, sound.name);
    } catch {
      continue;
    }
  }

  return null;
};

class SoundLibraryRepository {
  /**
   * 获取音效库根目录句柄（音乐/音效）
   */
  async getRootHandles(): Promise<SoundLibraryRootHandleMap> {
    const entry = await db.misc.get('soundLibraryRootHandles');
    const raw = entry?.value || {};

    const normalize = (value: any): Array<FileSystemDirectoryHandle | null> => {
      if (!value) return [null, null];
      if (Array.isArray(value)) {
        const first = value[0];
        const second = value[1];
        return [
          first && first.kind === 'directory' ? (first as FileSystemDirectoryHandle) : null,
          second && second.kind === 'directory' ? (second as FileSystemDirectoryHandle) : null,
        ];
      }
      if (value.kind === 'directory') return [value as FileSystemDirectoryHandle, null];
      return [null, null];
    };

    const music = normalize(raw.music);
    const sfx = normalize(raw.sfx);
    const normalized: SoundLibraryRootHandleMap = {};
    if (music.some(Boolean)) normalized.music = music;
    if (sfx.some(Boolean)) normalized.sfx = sfx;
    return normalized;
  }

  /**
   * 保存音效库根目录句柄
   */
  async saveRootHandle(root: SoundLibraryRoot, slotIndex: number, handle: FileSystemDirectoryHandle): Promise<void> {
    const handles = await this.getRootHandles();
    const current = handles[root] || [null, null];
    const next: Array<FileSystemDirectoryHandle | null> = [
      current[0] || null,
      current[1] || null,
    ];
    next[slotIndex] = handle;
    handles[root] = next;
    await db.misc.put({ key: 'soundLibraryRootHandles', value: handles });
  }

  /**
   * 请求已关联根目录的读取权限（用于播放/导出时权限丢失的恢复）。
   */
  async requestRootReadPermission(): Promise<boolean> {
    const handles = await this.getRootHandles();
    const allRoots = [
      ...(handles.music || []),
      ...(handles.sfx || []),
    ].filter((h): h is FileSystemDirectoryHandle => !!h && h.kind === 'directory');

    if (allRoots.length === 0) return true;

    for (const handle of allRoots) {
      const ok = await ensureHandlePermission(handle as any, 'read', true);
      if (!ok) return false;
    }
    return true;
  }

  /**
   * 获取一个音效文件（带权限检查，并在句柄失效时尝试从根目录按路径重新定位）。
   */
  async getSoundFile(sound: SoundLibraryItem, options?: SoundFileOptions): Promise<File> {
    const requestPermission = options?.requestPermission ?? true;
    const allowRootResolve = options?.allowRootResolve ?? true;

    try {
      if (sound.handle && typeof (sound.handle as any).getFile === 'function') {
        return await getFileFromHandle(sound.handle, { requestPermission });
      }
    } catch (err) {
      if (!allowRootResolve) throw err;
    }

    if (!allowRootResolve) {
      throw new Error('Cannot resolve sound file: invalid handle');
    }

    const roots = await this.getRootHandles();
    const resolvedHandle = await resolveFileHandleFromRoots(sound, roots, requestPermission);
    if (!resolvedHandle) {
      throw new Error('Cannot resolve sound file from linked roots');
    }

    // Best-effort: refresh stored handle for future use.
    if (sound.id !== undefined) {
      db.soundLibrary.update(sound.id, { handle: resolvedHandle }).catch(() => {});
    }

    return await getFileFromHandle(resolvedHandle, { requestPermission });
  }

  /**
   * 获取所有音效
   */
  async getSounds(): Promise<SoundLibraryItem[]> {
    return db.soundLibrary.toArray();
  }

  /**
   * 根据分类获取音效
   */
  async getSoundsByCategory(category: string): Promise<SoundLibraryItem[]> {
    return db.soundLibrary.where('category').equals(category).toArray();
  }
  
  /**
   * 批量添加音效
   */
  async addSounds(sounds: SoundLibraryItem[]): Promise<void> {
    if (sounds.length === 0) return;
    await db.soundLibrary.bulkAdd(sounds);
  }

  /**
   * 根据ID批量删除音效
   */
  async bulkDeleteByIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await db.soundLibrary.bulkDelete(ids);
  }

  /**
   * 清除音效
   * @param category 如果提供，则只清除该分类的音效；否则清除所有。
   */
  async clearSounds(category?: string): Promise<void> {
    if (category) {
      await db.soundLibrary.where('category').equals(category).delete();
    } else {
      await db.soundLibrary.clear();
    }
  }
}

export const soundLibraryRepository = new SoundLibraryRepository();
