import { useCallback, useEffect, useRef, useState } from 'react';

import * as mm from 'music-metadata-browser';

import type { SoundLibraryItem } from '../../../types';
import { getSoundFileNameFromSoundName } from '../../../lib/soundPath';
import { ensureHandlePermission } from '../../../lib/fileSystemAccess';
import { soundLibraryRepository } from '../../../repositories';

interface UseSoundGroupPreviewActionsParams {
  draftName: string;
  libraryRootHandle: FileSystemDirectoryHandle | null;
  setDraftDurationSeconds: React.Dispatch<
    React.SetStateAction<number | undefined>
  >;
}

export const useSoundGroupPreviewActions = ({
  draftName,
  libraryRootHandle,
  setDraftDurationSeconds,
}: UseSoundGroupPreviewActionsParams) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioPreview, setAudioPreview] = useState<{
    url: string;
    label: string;
  } | null>(null);
  const [isAudioPreviewLoading, setIsAudioPreviewLoading] = useState(false);

  const stopPreview = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.removeAttribute('src');
      } catch {}
    }

    if (audioPreview?.url) {
      try {
        URL.revokeObjectURL(audioPreview.url);
      } catch {}
    }

    setAudioPreview(null);
  }, [audioPreview]);

  const playFileAsPreview = useCallback(
    async (file: File, label: string) => {
      stopPreview();
      setIsAudioPreviewLoading(true);
      try {
        const url = URL.createObjectURL(file);
        setAudioPreview({ url, label });
      } finally {
        setIsAudioPreviewLoading(false);
      }
    },
    [stopPreview]
  );

  const handlePreviewLibraryWav = useCallback(
    async (previewWavFileName: string, label: string) => {
      if (!libraryRootHandle) {
        alert('尚未选择音效组库目录（用于读取预览 wav）。');
        return;
      }
      setIsAudioPreviewLoading(true);
      try {
        const ok = await ensureHandlePermission(
          libraryRootHandle as any,
          'read',
          true
        );
        if (!ok) {
          throw new Error('缺少读取音效组库目录的权限');
        }
        const fileHandle = await libraryRootHandle.getFileHandle(
          previewWavFileName,
          { create: false }
        );
        const file = await fileHandle.getFile();
        await playFileAsPreview(file, label);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        alert(`无法播放预览文件：${message}`);
      } finally {
        setIsAudioPreviewLoading(false);
      }
    },
    [libraryRootHandle, playFileAsPreview]
  );

  const handleAutofillDurationFromLibraryPreview = useCallback(async () => {
    const name = (draftName || '').trim();
    if (!name) {
      alert('请先填写音效组名称。');
      return;
    }
    if (!libraryRootHandle) {
      alert('尚未选择音效组库目录（用于读取预览 wav）。');
      return;
    }
    setIsAudioPreviewLoading(true);
    try {
      const ok = await ensureHandlePermission(
        libraryRootHandle as any,
        'read',
        true
      );
      if (!ok) {
        throw new Error('缺少读取音效组库目录的权限');
      }
      const previewName = `${name}_preview.wav`;
      const previewHandle = await libraryRootHandle.getFileHandle(previewName, {
        create: false,
      });
      const previewFile = await previewHandle.getFile();
      const metadata = await mm.parseBlob(previewFile);
      if (
        typeof metadata.format.duration === 'number' &&
        isFinite(metadata.format.duration)
      ) {
        setDraftDurationSeconds(metadata.format.duration);
      } else {
        alert('未能从预览文件读取到时长（可能是格式不支持或文件损坏）。');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`读取预览时长失败：${message}`);
    } finally {
      setIsAudioPreviewLoading(false);
    }
  }, [draftName, libraryRootHandle, setDraftDurationSeconds]);

  const handlePreviewSound = useCallback(
    async (sound: SoundLibraryItem) => {
      if (!sound.id) {
        return;
      }
      setIsAudioPreviewLoading(true);
      try {
        const file = await soundLibraryRepository.getSoundFile(sound, {
          requestPermission: true,
          allowRootResolve: true,
        });
        const label = getSoundFileNameFromSoundName(sound.name) ?? sound.name;
        await playFileAsPreview(file, label);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        alert(`无法预览该音效：${message}`);
      } finally {
        setIsAudioPreviewLoading(false);
      }
    },
    [playFileAsPreview]
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioPreview) {
      return;
    }
    audio.src = audioPreview.url;
    audio.play().catch(() => {});
  }, [audioPreview]);

  return {
    audioPreview,
    audioRef,
    handleAutofillDurationFromLibraryPreview,
    handlePreviewLibraryWav,
    handlePreviewSound,
    isAudioPreviewLoading,
    stopPreview,
  };
};
