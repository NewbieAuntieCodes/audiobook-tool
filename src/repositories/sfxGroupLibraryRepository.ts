/**
 * 音效组库（Reaper 子工程 .rpp）数据操作层
 *
 * - 存储：根目录句柄（用于扫描/预览文件） + 绝对路径（用于导出 Reaper 时写入 .rpp 引用）
 */

import { db } from '../db';

const ROOT_HANDLE_KEY = 'sfxGroupLibraryRootHandle';
const BASE_PATH_KEY = 'sfxGroupLibraryBasePath';

class SfxGroupLibraryRepository {
  async getRootHandle(): Promise<FileSystemDirectoryHandle | null> {
    const entry = await db.misc.get(ROOT_HANDLE_KEY);
    return entry?.value || null;
  }

  async saveRootHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    await db.misc.put({ key: ROOT_HANDLE_KEY, value: handle });
  }

  async clearRootHandle(): Promise<void> {
    await db.misc.delete(ROOT_HANDLE_KEY);
  }

  async getBasePath(): Promise<string> {
    const entry = await db.misc.get(BASE_PATH_KEY);
    const value = entry?.value;
    return typeof value === 'string' ? value : '';
  }

  async saveBasePath(path: string): Promise<void> {
    await db.misc.put({ key: BASE_PATH_KEY, value: path });
  }
}

export const sfxGroupLibraryRepository = new SfxGroupLibraryRepository();

