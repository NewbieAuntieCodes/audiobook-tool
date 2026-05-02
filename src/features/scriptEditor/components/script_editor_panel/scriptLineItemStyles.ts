import type { CSSProperties } from 'react';

import type { Character } from '../../../../types';
import { isHexColor, getContrastingTextColor } from '../../../../lib/colorUtils';
import { tailwindToHex } from '../../../../lib/tailwindColorMap';

type AppliedStyle = {
  className: string;
  style?: CSSProperties;
};

type CvStyles = Record<string, { bgColor: string; textColor: string }>;

const DEFAULT_CONTENT_EDITABLE_CLASSES =
  'flex-grow p-2 rounded-md min-h-[40px] focus:ring-1 focus:ring-sky-500 outline-none whitespace-pre-wrap caret-slate-100';

export const getScriptLineCharacterSelectStyle = ({
  character,
  isCharacterMissing,
  isSilentLine,
}: {
  character?: Character;
  isCharacterMissing: boolean;
  isSilentLine: boolean;
}): AppliedStyle => {
  if (isSilentLine) {
    return { className: 'bg-slate-700/60 text-slate-500' };
  }

  if (isCharacterMissing) {
    return { className: 'bg-orange-400 text-orange-900' };
  }

  if (!character) {
    return { className: 'bg-slate-600 text-slate-100' };
  }

  const backgroundIsHex = isHexColor(character.color);
  const textIsHex = isHexColor(character.textColor || '');

  return {
    style: {
      ...(backgroundIsHex && { backgroundColor: character.color }),
      ...(textIsHex && { color: character.textColor }),
    },
    className: `${backgroundIsHex ? '' : character.color || 'bg-slate-600'} ${
      textIsHex ? '' : character.textColor || 'text-slate-100'
    }`,
  };
};

export const getScriptLineCvButtonStyle = (
  character: Character | undefined,
  cvStyles: CvStyles
): AppliedStyle => {
  if (!character) {
    return { className: 'bg-black bg-opacity-25 hover:bg-opacity-40 text-slate-200' };
  }

  const cvName = character.cvName;
  const cvStyle = cvName ? cvStyles[cvName] : undefined;
  const cvBackground = cvStyle ? cvStyle.bgColor : cvName ? 'bg-slate-700' : '';
  const cvText = cvStyle ? cvStyle.textColor : cvName ? 'text-slate-300' : '';
  const backgroundIsHex = isHexColor(cvBackground);
  const textIsHex = isHexColor(cvText);
  const defaultBackgroundClass = 'bg-black bg-opacity-25 hover:bg-opacity-40';
  const defaultTextClass = 'text-slate-200';

  let finalBackgroundClass = !backgroundIsHex
    ? cvBackground || defaultBackgroundClass
    : '';
  let finalTextClass = !textIsHex ? cvText || '' : '';
  let textStyle = textIsHex ? { color: cvText } : {};

  if (backgroundIsHex && (!cvText || !textIsHex)) {
    textStyle = { color: getContrastingTextColor(cvBackground) };
    finalTextClass = '';
  } else if (!cvText && !textIsHex && !cvName) {
    finalTextClass = defaultTextClass;
  } else if (!cvText && !textIsHex && cvName && !cvStyle) {
    finalTextClass = defaultTextClass;
  }

  return {
    style: {
      ...(backgroundIsHex && { backgroundColor: cvBackground }),
      ...textStyle,
    },
    className: `${finalBackgroundClass} ${finalTextClass}`,
  };
};

export const getScriptLineCvButtonText = (character?: Character) =>
  character?.cvName ? character.cvName : '添加CV';

export const getScriptLineContentEditablePresentation = ({
  character,
  isSilentLine,
}: {
  character?: Character;
  isSilentLine: boolean;
}): { className: string; style: CSSProperties } => {
  const style: CSSProperties = {};
  let className = DEFAULT_CONTENT_EDITABLE_CLASSES;
  const isNarrator = !character || character.name === 'Narrator';

  if (isSilentLine) {
    className += ' bg-slate-800 text-slate-500 italic';
    return { className, style };
  }

  if (isNarrator) {
    className += ' bg-slate-700 text-slate-100';
    return { className, style };
  }

  if (!character) {
    className += ' bg-slate-700 text-slate-100';
    return { className, style };
  }

  const characterBackground = character.color;
  const characterText = character.textColor;

  if (isHexColor(characterBackground)) {
    style.backgroundColor = characterBackground;
  } else {
    className += ` ${characterBackground || 'bg-slate-700'}`;
  }

  if (characterText) {
    if (isHexColor(characterText)) {
      style.color = characterText;
    } else {
      style.color = tailwindToHex[characterText] || '#F1F5F9';
    }
  } else {
    const backgroundAsHex = isHexColor(characterBackground)
      ? characterBackground
      : tailwindToHex[characterBackground] || '#334155';
    style.color = getContrastingTextColor(backgroundAsHex);
  }

  style.caretColor = getContrastingTextColor(
    isHexColor(characterBackground)
      ? characterBackground
      : tailwindToHex[characterBackground] || '#334155'
  );

  return { className, style };
};
