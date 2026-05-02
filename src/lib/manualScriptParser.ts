import { ScriptLine, Character } from '../types';
import { normalizeCharacterNameKey, sanitizeCharacterDisplayName } from './characterName';

interface ParsedSegment {
  text: string;
  originalText?: string;
  isDialogue: boolean;
}

const FULL_BRACKET_DIALOGUE_REGEX = /^\s*[【\[]\s*([\s\S]*?)\s*[】\]]\s*$/;

const getCharacterId = (
  name: string,
  existingCharacters: Character[],
  addCharacterCallback: (character: Pick<Character, 'name' | 'color' | 'textColor' | 'description'>) => Character,
  tempCharMap: Map<string, Character>,
): string => {
  const standardizedName = sanitizeCharacterDisplayName(name);
  const standardizedNameKey = normalizeCharacterNameKey(standardizedName);

  const existingByName = existingCharacters.find((c) => normalizeCharacterNameKey(c.name) === standardizedNameKey);
  if (existingByName) return existingByName.id;

  const cached = tempCharMap.get(standardizedNameKey);
  if (cached) return cached.id;

  const availableColors = [
    'bg-gray-500',
    'bg-stone-500',
    'bg-red-500',
    'bg-orange-500',
    'bg-amber-500',
    'bg-yellow-500',
    'bg-lime-500',
    'bg-green-500',
    'bg-emerald-500',
    'bg-teal-500',
    'bg-cyan-500',
    'bg-sky-500',
    'bg-blue-500',
    'bg-indigo-500',
    'bg-violet-500',
    'bg-purple-500',
    'bg-fuchsia-500',
    'bg-pink-500',
    'bg-rose-500',
  ];
  const colorIndex = tempCharMap.size % availableColors.length;

  const UNKNOWN_SPEAKER_NAME_INTERNAL = '待识别角色';

  const newCharData = {
    name: standardizedName,
    color:
      standardizedName === 'Narrator'
        ? 'bg-slate-600'
        : standardizedName === UNKNOWN_SPEAKER_NAME_INTERNAL
          ? 'bg-orange-400'
          : availableColors[colorIndex],
    textColor:
      standardizedName === 'Narrator'
        ? 'text-slate-100'
        : standardizedName === UNKNOWN_SPEAKER_NAME_INTERNAL
          ? 'text-black'
          : 'text-white',
    description: '',
  };
  const addedChar = addCharacterCallback(newCharData);
  tempCharMap.set(standardizedNameKey, addedChar);
  return addedChar.id;
};

export const parseRawTextToScriptLinesByRules = (
  rawText: string,
  existingCharacters: Character[],
  addCharacterCallback: (character: Pick<Character, 'name' | 'color' | 'textColor' | 'description'>) => Character,
): ScriptLine[] => {
  if (!rawText || rawText.trim() === '') return [];

  const outputSegments: ParsedSegment[] = [];
  const lines = rawText.split(/\r?\n/);

  const CHINESE_QUOTE_START = '“';
  const CHINESE_QUOTE_END = '”';

  for (const line of lines) {
    const fullBracketDialogueMatch = line.match(FULL_BRACKET_DIALOGUE_REGEX);
    if (fullBracketDialogueMatch) {
      const text = line.trim();
      const originalText = fullBracketDialogueMatch[1]?.trim() || '';
      if (originalText) {
        outputSegments.push({
          text,
          originalText,
          isDialogue: true,
        });
        continue;
      }
    }

    let currentPos = 0;
    const lineLength = line.length;

    while (currentPos < lineLength) {
      const nextDialogueStart = line.indexOf(CHINESE_QUOTE_START, currentPos);

      if (nextDialogueStart === -1) {
        const remainingNarration = line.substring(currentPos).trim();
        if (remainingNarration) {
          outputSegments.push({
            text: remainingNarration,
            originalText: remainingNarration,
            isDialogue: false,
          });
        }
        break;
      }

      const narrationBeforeText = line.substring(currentPos, nextDialogueStart).trim();
      if (narrationBeforeText) {
        outputSegments.push({
          text: narrationBeforeText,
          originalText: narrationBeforeText,
          isDialogue: false,
        });
      }

      const nextDialogueEnd = line.indexOf(CHINESE_QUOTE_END, nextDialogueStart + 1);
      if (nextDialogueEnd === -1) {
        const restOfLine = line.substring(nextDialogueStart).trim();
        if (restOfLine) {
          outputSegments.push({
            text: restOfLine,
            originalText: restOfLine.substring(1),
            isDialogue: true,
          });
        }
        break;
      }

      const dialogueTextWithQuotes = line.substring(nextDialogueStart, nextDialogueEnd + 1);
      const dialogueTextWithoutQuotes = line.substring(nextDialogueStart + 1, nextDialogueEnd);
      outputSegments.push({
        text: dialogueTextWithQuotes,
        originalText: dialogueTextWithoutQuotes,
        isDialogue: true,
      });

      currentPos = nextDialogueEnd + 1;
    }
  }

  const scriptLines: ScriptLine[] = [];
  const tempCharacterMap = new Map<string, Character>();

  const NARRATOR_NAME = 'Narrator';
  const UNKNOWN_SPEAKER_NAME = '待识别角色';

  for (let i = 0; i < outputSegments.length; i++) {
    const segment = outputSegments[i];
    const characterNameForSegment = segment.isDialogue ? UNKNOWN_SPEAKER_NAME : NARRATOR_NAME;

    if (
      !segment.isDialogue &&
      scriptLines.length > 0 &&
      scriptLines[scriptLines.length - 1].characterId &&
      (existingCharacters.find((c) => c.id === scriptLines[scriptLines.length - 1].characterId)?.name === NARRATOR_NAME ||
        tempCharacterMap.get(normalizeCharacterNameKey(NARRATOR_NAME))?.id ===
          scriptLines[scriptLines.length - 1].characterId)
    ) {
      scriptLines[scriptLines.length - 1].text += `\n${segment.text}`;
      if (scriptLines[scriptLines.length - 1].originalText) {
        scriptLines[scriptLines.length - 1].originalText += `\n${segment.text}`;
      } else {
        scriptLines[scriptLines.length - 1].originalText = segment.text;
      }
      continue;
    }

    const charId = getCharacterId(characterNameForSegment, existingCharacters, addCharacterCallback, tempCharacterMap);
    scriptLines.push({
      id: Date.now().toString() + '_line_manual_' + i + Math.random(),
      text: segment.text,
      originalText: segment.originalText,
      characterId: charId,
      isAiAudioLoading: false,
      isAiAudioSynced: false,
      isTextModifiedManual: false,
    });
  }

  // Important: do NOT merge consecutive dialogue lines (even if all are "待识别角色").
  // Each quoted segment should remain an independent text box.
  return scriptLines;
};
