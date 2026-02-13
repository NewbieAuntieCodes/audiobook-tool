export type FileSystemAccessMode = 'read' | 'readwrite';

type PermissionCapableHandle = {
  queryPermission?: (descriptor?: { mode?: FileSystemAccessMode }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: FileSystemAccessMode }) => Promise<PermissionState>;
};

export const ensureHandlePermission = async (
  handle: PermissionCapableHandle | null | undefined,
  mode: FileSystemAccessMode = 'read',
  request: boolean = true
): Promise<boolean> => {
  if (!handle) return false;

  try {
    if (typeof handle.queryPermission === 'function') {
      const current = await handle.queryPermission({ mode });
      if (current === 'granted') return true;
      if (!request) return false;
    }

    if (request && typeof handle.requestPermission === 'function') {
      const result = await handle.requestPermission({ mode });
      return result === 'granted';
    }
  } catch {
    return false;
  }

  return true;
};

export const getFileFromHandle = async (
  handle: FileSystemFileHandle,
  options?: { requestPermission?: boolean }
): Promise<File> => {
  const ok = await ensureHandlePermission(handle as any, 'read', options?.requestPermission ?? true);
  if (!ok) {
    throw new Error('Missing read permission for file handle');
  }

  return handle.getFile();
};

