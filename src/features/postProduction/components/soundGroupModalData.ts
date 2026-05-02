import type { SoundGroup, SoundLibraryItem } from '../../../types';

export type DraftClip = {
  soundId?: number;
  soundName?: string;
  offsetSeconds: number;
};

export type SoundGroupKind = NonNullable<SoundGroup['kind']>;

export type LibraryGroupEntry = {
  name: string;
  reaperFileName: string;
  previewWavFileName?: string;
  durationSeconds?: number;
};

export type SoundGroupInsertOption = {
  value: string;
  label: string;
};

export type SelectedSoundGroupInsert =
  | { type: 'project'; group: SoundGroup }
  | { type: 'library'; entry: LibraryGroupEntry }
  | null;

export const createSoundGroupId = (): string =>
  `sg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const buildSoundGroupsById = (soundGroups: SoundGroup[]) => {
  const groupsById = new Map<string, SoundGroup>();
  soundGroups.forEach((group) => groupsById.set(group.id, group));
  return groupsById;
};

export const sortSoundGroupsByName = (soundGroups: SoundGroup[]) => {
  return [...soundGroups].sort((left, right) =>
    (left.name || '').localeCompare(right.name || '', 'zh-Hans-CN')
  );
};

export const buildSoundLibraryMapById = (soundLibrary: SoundLibraryItem[]) => {
  const soundLibraryMapById = new Map<number, SoundLibraryItem>();
  for (const sound of soundLibrary) {
    if (typeof sound.id === 'number') {
      soundLibraryMapById.set(sound.id, sound);
    }
  }
  return soundLibraryMapById;
};

export const buildSoundLibraryMapByName = (soundLibrary: SoundLibraryItem[]) => {
  const soundLibraryMapByName = new Map<string, SoundLibraryItem>();
  for (const sound of soundLibrary) {
    if (typeof sound.name === 'string') {
      soundLibraryMapByName.set(sound.name, sound);
    }
  }
  return soundLibraryMapByName;
};

export const filterLibraryGroupEntries = (
  libraryGroups: LibraryGroupEntry[],
  librarySearch: string
) => {
  const query = (librarySearch || '').trim().toLowerCase();
  if (!query) {
    return libraryGroups;
  }

  return libraryGroups.filter((group) =>
    (group.name || '').toLowerCase().includes(query)
  );
};

export const buildSoundGroupInsertOptions = (
  sortedGroups: SoundGroup[],
  filteredLibraryGroups: LibraryGroupEntry[]
): SoundGroupInsertOption[] => {
  const options: SoundGroupInsertOption[] = [];

  sortedGroups.forEach((group) => {
    const kindLabel =
      ((group.kind || 'expanded') as SoundGroupKind) === 'reaperSubproject'
        ? '（子工程）'
        : '';
    options.push({
      value: `proj:${group.id}`,
      label: `${group.name}${kindLabel}`,
    });
  });

  filteredLibraryGroups.forEach((group) => {
    options.push({
      value: `lib:${group.reaperFileName}`,
      label: `【库】${group.name}`,
    });
  });

  return options;
};

export const resolveSelectedSoundGroupInsert = ({
  selectedInsertValue,
  groupsById,
  libraryGroups,
}: {
  selectedInsertValue: string;
  groupsById: Map<string, SoundGroup>;
  libraryGroups: LibraryGroupEntry[];
}): SelectedSoundGroupInsert => {
  const value = (selectedInsertValue || '').trim();
  if (!value) {
    return null;
  }

  if (value.startsWith('proj:')) {
    const groupId = value.slice('proj:'.length);
    const group = groupsById.get(groupId);
    return group ? { type: 'project', group } : null;
  }

  if (value.startsWith('lib:')) {
    const reaperFileName = value.slice('lib:'.length);
    const entry = libraryGroups.find(
      (group) => group.reaperFileName === reaperFileName
    );
    return entry ? { type: 'library', entry } : null;
  }

  return null;
};

export const findSoundResults = (
  soundSearch: string,
  soundLibrary: SoundLibraryItem[],
  maxResults = 30
) => {
  const query = (soundSearch || '').trim().toLowerCase();
  if (!query) {
    return [];
  }

  const results: SoundLibraryItem[] = [];
  for (const sound of soundLibrary) {
    const soundName = (sound.name || '').toLowerCase();
    if (!soundName.includes(query)) {
      continue;
    }
    results.push(sound);
    if (results.length >= maxResults) {
      break;
    }
  }

  return results;
};

export const toDraftClips = (group: SoundGroup): DraftClip[] => {
  return (group.clips || []).map((clip) => ({
    soundId: clip.soundId,
    soundName: clip.soundName,
    offsetSeconds:
      typeof clip.offsetSeconds === 'number' ? clip.offsetSeconds : 0,
  }));
};

export const getExpectedReaperFileName = (draftName: string) => {
  const trimmedName = (draftName || '').trim();
  return trimmedName ? `${trimmedName}.rpp` : '';
};

export const getExpectedPreviewWavFileName = (draftName: string) => {
  const trimmedName = (draftName || '').trim();
  return trimmedName ? `${trimmedName}_preview.wav` : '';
};

export const normalizeExportBasePath = (libraryBasePath: string) =>
  (libraryBasePath || '').trim();
