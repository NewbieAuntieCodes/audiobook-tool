import { useCallback } from 'react';
import type { Character } from '../../../../types';
import useStore from '../../../../store/useStore';
import {
  normalizeCharacterNameKey,
  sanitizeCharacterDisplayName,
} from '../../../../lib/characterName';

interface UseAnnotationCharacterResolverProps {
  onAddCharacter: (
    character: Pick<
      Character,
      'name' | 'color' | 'textColor' | 'cvName' | 'description' | 'isStyleLockedToCv'
    >
  ) => Character;
}

function getCharacterStyle(displayName: string, colorSeed: number) {
  if (displayName === 'Narrator') {
    return { color: 'bg-slate-600', textColor: 'text-slate-100' };
  }

  if (displayName === '待识别角色') {
    return { color: 'bg-orange-400', textColor: 'text-black' };
  }

  const availableColors = [
    'bg-red-500',
    'bg-blue-500',
    'bg-green-500',
    'bg-yellow-400',
    'bg-purple-600',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
  ];
  const availableTextColors = [
    'text-red-100',
    'text-blue-100',
    'text-green-100',
    'text-yellow-800',
    'text-purple-100',
    'text-pink-100',
    'text-indigo-100',
    'text-teal-100',
  ];
  const colorIndex = colorSeed % availableColors.length;

  return {
    color: availableColors[colorIndex],
    textColor: availableTextColors[colorIndex],
  };
}

export function useAnnotationCharacterResolver({
  onAddCharacter,
}: UseAnnotationCharacterResolverProps) {
  const resolveCharacterForAssignment = useCallback(
    (
      projectId: string,
      rawCharacterName: string,
      cvName: string | undefined,
      newCharacterMap: Map<string, Character>
    ): Character => {
      const displayName =
        sanitizeCharacterDisplayName(rawCharacterName) || '待识别角色';
      const key = normalizeCharacterNameKey(displayName);

      const cached = newCharacterMap.get(key);
      if (cached) {
        return cached;
      }

      const existingInStore = useStore
        .getState()
        .characters.find(
          (character) =>
            normalizeCharacterNameKey(character.name) === key &&
            (!character.projectId || character.projectId === projectId) &&
            character.status !== 'merged'
        );

      if (existingInStore) {
        newCharacterMap.set(key, existingInStore);
        return existingInStore;
      }

      const style = getCharacterStyle(displayName, newCharacterMap.size);
      const created = onAddCharacter({
        name: displayName,
        color: style.color,
        textColor: style.textColor,
        cvName,
        description: '',
        isStyleLockedToCv: false,
      });
      newCharacterMap.set(key, created);
      return created;
    },
    [onAddCharacter]
  );

  return {
    resolveCharacterForAssignment,
  };
}
