export type ElectronBackedFile = File & {
  path?: string;
};

export interface DisplayFile {
  name: string;
  path?: string;
}

export const getElectronFilePath = (file: File): string | undefined => {
  return (file as ElectronBackedFile).path;
};

export const toDisplayFiles = (files: File[]): DisplayFile[] => {
  return files.map((file) => ({
    name: file.name,
    path: getElectronFilePath(file),
  }));
};

export const removeFileByIdentity = (files: File[], fileToRemove: DisplayFile) => {
  return files.filter((file) => {
    const identity = getElectronFilePath(file) || file.name;
    return identity !== (fileToRemove.path || fileToRemove.name);
  });
};

export const extractChapterNumberFromFilename = (filename: string): number | null => {
  const base = String(filename || '').replace(/\.[^.]+$/, '');
  const matchedChapter = base.match(/第\s*0*(\d{1,5})\s*(?:集|章|回|话)/);
  if (matchedChapter?.[1]) {
    const parsed = Number.parseInt(matchedChapter[1], 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const numericBlocks = Array.from(base.matchAll(/\d+/g)).map((match) => match[0]);
  if (numericBlocks.length === 0) {
    return null;
  }

  const preferredBlock = numericBlocks.find((block) => block.length <= 4);
  const chosenBlock = preferredBlock ?? numericBlocks[0];
  const parsed = Number.parseInt(chosenBlock, 10);
  return Number.isFinite(parsed) ? parsed : null;
};
