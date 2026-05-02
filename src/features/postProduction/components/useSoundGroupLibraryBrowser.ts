import { useCallback, useEffect, useState } from 'react';

import * as mm from 'music-metadata-browser';

import { ensureHandlePermission } from '../../../lib/fileSystemAccess';
import { sfxGroupLibraryRepository } from '../../../repositories';
import type { LibraryGroupEntry } from './soundGroupModalData';

interface UseSoundGroupLibraryBrowserParams {
  isOpen: boolean;
}

export const useSoundGroupLibraryBrowser = ({
  isOpen,
}: UseSoundGroupLibraryBrowserParams) => {
  const [libraryBasePath, setLibraryBasePath] = useState('');
  const [libraryRootHandle, setLibraryRootHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [isLibraryScanning, setIsLibraryScanning] = useState(false);
  const [libraryGroups, setLibraryGroups] = useState<LibraryGroupEntry[]>([]);
  const [libraryScanError, setLibraryScanError] = useState<string | null>(null);
  const [librarySearch, setLibrarySearch] = useState('');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void (async () => {
      try {
        const [handle, basePath] = await Promise.all([
          sfxGroupLibraryRepository.getRootHandle(),
          sfxGroupLibraryRepository.getBasePath(),
        ]);
        setLibraryRootHandle(handle);
        setLibraryBasePath(basePath);
      } catch {}
    })();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !libraryRootHandle) {
      return;
    }

    const scanLibraryGroups = async () => {
      setLibraryScanError(null);
      setIsLibraryScanning(true);
      try {
        const ok = await ensureHandlePermission(
          libraryRootHandle as any,
          'read',
          true
        );
        if (!ok) {
          throw new Error('缺少读取音效组库目录的权限');
        }

        const entries: LibraryGroupEntry[] = [];
        for await (const entry of libraryRootHandle.values()) {
          if (entry.kind !== 'file') {
            continue;
          }

          const fileName = entry.name || '';
          if (!fileName.toLowerCase().endsWith('.rpp')) {
            continue;
          }

          const baseName = fileName.replace(/\.rpp$/i, '');
          const previewName = `${baseName}_preview.wav`;

          let previewWavFileName: string | undefined;
          let durationSeconds: number | undefined;

          try {
            const previewHandle = await libraryRootHandle.getFileHandle(
              previewName,
              { create: false }
            );
            const previewFile = await previewHandle.getFile();
            const metadata = await mm.parseBlob(previewFile);
            if (
              typeof metadata.format.duration === 'number' &&
              isFinite(metadata.format.duration)
            ) {
              durationSeconds = metadata.format.duration;
            }
            previewWavFileName = previewName;
          } catch {
            // preview is optional
          }

          entries.push({
            name: baseName,
            reaperFileName: fileName,
            previewWavFileName,
            durationSeconds,
          });
        }

        entries.sort((left, right) =>
          (left.name || '').localeCompare(right.name || '', 'zh-Hans-CN')
        );
        setLibraryGroups(entries);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLibraryGroups([]);
        setLibraryScanError(message || '扫描失败');
      } finally {
        setIsLibraryScanning(false);
      }
    };

    void scanLibraryGroups();
  }, [isOpen, libraryRootHandle]);

  const handleSelectLibraryDirectory = useCallback(async () => {
    try {
      const picker = (window as any).showDirectoryPicker as
        | undefined
        | (() => Promise<FileSystemDirectoryHandle>);
      if (typeof picker !== 'function') {
        alert('当前环境不支持选择文件夹（showDirectoryPicker）。');
        return;
      }
      const handle = await picker();
      if (!handle || handle.kind !== 'directory') {
        return;
      }
      const ok = await ensureHandlePermission(handle as any, 'read', true);
      if (!ok) {
        alert('需要授权读取该文件夹权限，才能扫描/试听音效组库。');
        return;
      }
      await sfxGroupLibraryRepository.saveRootHandle(handle);
      setLibraryRootHandle(handle);
      setLibraryScanError(null);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      alert(`选择音效组库目录失败：${message}`);
    }
  }, []);

  const handleClearLibraryDirectory = useCallback(async () => {
    const ok = window.confirm(
      '确认清除已关联的音效组库目录？（不会删除磁盘文件）'
    );
    if (!ok) {
      return;
    }
    try {
      await sfxGroupLibraryRepository.clearRootHandle();
    } catch {}
    setLibraryRootHandle(null);
    setLibraryGroups([]);
    setLibraryScanError(null);
  }, []);

  const handleSaveLibraryBasePath = useCallback(async () => {
    const nextPath = (libraryBasePath || '').trim();
    try {
      await sfxGroupLibraryRepository.saveBasePath(nextPath);
      setLibraryBasePath(nextPath);
      alert('已保存音效组库绝对路径。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`保存失败：${message}`);
    }
  }, [libraryBasePath]);

  return {
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
  };
};
