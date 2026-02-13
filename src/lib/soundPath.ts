export const normalizeSoundPath = (value: string): string => {
  return (value || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/');
};

/**
 * 从音效库中保存的相对路径（如 "脚步/Run.mp3" 或 "环境音效/雨/xxx.wav"）
 * 提取“最近一级父文件夹名”（即文件所在的直接父目录）。
 *
 * - "脚步/Run.mp3" => "脚步"
 * - "环境音效/雨/xxx.wav" => "雨"
 * - "Run.mp3" => null
 */
export const getNearestFolderNameFromSoundName = (soundName: string): string | null => {
  const normalized = normalizeSoundPath(soundName).trim();
  if (!normalized) return null;

  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) return null;

  const dir = normalized.slice(0, lastSlash).replace(/\/+$/, '');
  if (!dir) return null;

  const parentSlash = dir.lastIndexOf('/');
  const folderName = parentSlash >= 0 ? dir.slice(parentSlash + 1) : dir;
  return folderName || null;
};

export const getSoundFileNameFromSoundName = (soundName: string): string | null => {
  const normalized = normalizeSoundPath(soundName).trim();
  if (!normalized) return null;

  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  return parts[parts.length - 1] || null;
};

/**
 * 提取“根目录下第一层文件夹名”（用于音效助手按文件夹分类）。
 *
 * - "脚步/Run.mp3" => "脚步"
 * - "环境音/雨/xxx.wav" => "环境音"
 * - "Run.mp3" => null
 */
export const getTopLevelFolderNameFromSoundName = (soundName: string): string | null => {
  const normalized = normalizeSoundPath(soundName).trim();
  if (!normalized) return null;

  const firstSlash = normalized.indexOf('/');
  if (firstSlash <= 0) return null;
  return normalized.slice(0, firstSlash) || null;
};
