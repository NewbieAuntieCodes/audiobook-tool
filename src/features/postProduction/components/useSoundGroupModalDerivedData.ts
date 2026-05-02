import { useMemo } from 'react';

import type { SoundGroup, SoundLibraryItem } from '../../../types';
import {
  buildSoundGroupInsertOptions,
  buildSoundGroupsById,
  buildSoundLibraryMapById,
  buildSoundLibraryMapByName,
  filterLibraryGroupEntries,
  findSoundResults,
  getExpectedPreviewWavFileName,
  getExpectedReaperFileName,
  normalizeExportBasePath,
  resolveSelectedSoundGroupInsert,
  sortSoundGroupsByName,
  type LibraryGroupEntry,
} from './soundGroupModalData';

interface UseSoundGroupModalDerivedDataParams {
  soundGroups: SoundGroup[];
  soundLibrary: SoundLibraryItem[];
  libraryGroups: LibraryGroupEntry[];
  librarySearch: string;
  selectedInsertValue: string;
  soundSearch: string;
  draftName: string;
  libraryBasePath: string;
}

export const useSoundGroupModalDerivedData = ({
  soundGroups,
  soundLibrary,
  libraryGroups,
  librarySearch,
  selectedInsertValue,
  soundSearch,
  draftName,
  libraryBasePath,
}: UseSoundGroupModalDerivedDataParams) => {
  const groupsById = useMemo(() => {
    return buildSoundGroupsById(soundGroups || []);
  }, [soundGroups]);

  const sortedGroups = useMemo(() => {
    return sortSoundGroupsByName(soundGroups || []);
  }, [soundGroups]);

  const soundLibraryMapById = useMemo(() => {
    return buildSoundLibraryMapById(soundLibrary || []);
  }, [soundLibrary]);

  const soundLibraryMapByName = useMemo(() => {
    return buildSoundLibraryMapByName(soundLibrary || []);
  }, [soundLibrary]);

  const filteredLibraryGroups = useMemo(() => {
    return filterLibraryGroupEntries(libraryGroups, librarySearch);
  }, [libraryGroups, librarySearch]);

  const insertOptions = useMemo(() => {
    return buildSoundGroupInsertOptions(sortedGroups, filteredLibraryGroups);
  }, [filteredLibraryGroups, sortedGroups]);

  const selectedInsert = useMemo(() => {
    return resolveSelectedSoundGroupInsert({
      selectedInsertValue,
      groupsById,
      libraryGroups,
    });
  }, [selectedInsertValue, groupsById, libraryGroups]);

  const soundResults = useMemo(() => {
    return findSoundResults(soundSearch, soundLibrary || []);
  }, [soundLibrary, soundSearch]);

  const expectedReaperFileName = useMemo(() => {
    return getExpectedReaperFileName(draftName);
  }, [draftName]);

  const expectedPreviewWavFileName = useMemo(() => {
    return getExpectedPreviewWavFileName(draftName);
  }, [draftName]);

  const exportBasePath = useMemo(() => {
    return normalizeExportBasePath(libraryBasePath);
  }, [libraryBasePath]);

  return {
    exportBasePath,
    expectedPreviewWavFileName,
    expectedReaperFileName,
    groupsById,
    insertOptions,
    selectedInsert,
    sortedGroups,
    soundLibraryMapById,
    soundLibraryMapByName,
    soundResults,
  };
};
