import React, {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { Character, ScriptLine } from '../../../../types';
import {
  getActiveElementDebugInfo,
  logEditorFocusDebug,
} from './editorFocusDebug';
import {
  ensureSfxDisplayStyle,
  htmlToTextWithNewlines,
  tokensToDisplayHtml,
} from './scriptLineTextDisplay';
import { getScriptLineContentEditablePresentation } from './scriptLineItemStyles';

interface UseScriptLineContentEditableParams {
  line: ScriptLine;
  chapterId: string;
  character?: Character;
  isSilentLine: boolean;
  isSelectionMode: boolean;
  onFocusChange: (lineId: string | null) => void;
  onUpdateText: (chapterId: string, lineId: string, newText: string) => void;
}

const logScriptLineFocusDebug = (
  message: string,
  payload: Record<string, unknown>
) => {
  logEditorFocusDebug(`[ScriptLine] ${message}`, payload);
};

export const useScriptLineContentEditable = ({
  line,
  chapterId,
  character,
  isSilentLine,
  isSelectionMode,
  onFocusChange,
  onUpdateText,
}: UseScriptLineContentEditableParams) => {
  const contentEditableRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    ensureSfxDisplayStyle();
  }, []);

  const plainHtml = useMemo(() => {
    return tokensToDisplayHtml(line.text || '');
  }, [line.text]);

  const updateTextFromHtml = useCallback(
    (html: string) => {
      const newDisplayPlain = htmlToTextWithNewlines(html).replace(/\u200B/g, '');
      if (newDisplayPlain !== line.text) {
        logScriptLineFocusDebug('contentEditable input dispatch', {
          lineId: line.id,
          previousLength: (line.text || '').length,
          nextLength: newDisplayPlain.length,
          activeElement: getActiveElementDebugInfo(),
        });
        onUpdateText(chapterId, line.id, newDisplayPlain);
      }
    },
    [chapterId, line.id, line.text, onUpdateText]
  );

  const handleDivFocus = useCallback(() => {
    setIsEditing(true);
    startTransition(() => {
      onFocusChange(line.id);
    });
    logScriptLineFocusDebug('contentEditable focus', {
      lineId: line.id,
      textLength: (line.text || '').length,
      selectionMode: isSelectionMode,
      activeElement: getActiveElementDebugInfo(),
    });
  }, [isSelectionMode, line.id, line.text, onFocusChange]);

  const handleDivBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      setIsEditing(false);
      startTransition(() => {
        onFocusChange(null);
      });
      logScriptLineFocusDebug('contentEditable blur', {
        lineId: line.id,
        textLength: (line.text || '').length,
        activeElement: getActiveElementDebugInfo(),
      });

      updateTextFromHtml(event.currentTarget.innerHTML);
    },
    [line.id, line.text, onFocusChange, updateTextFromHtml]
  );

  const handleInput = useCallback(
    (event: React.FormEvent<HTMLDivElement>) => {
      updateTextFromHtml((event.target as HTMLDivElement).innerHTML);
    },
    [updateTextFromHtml]
  );

  useEffect(() => {
    const element = contentEditableRef.current;
    if (!element || isEditing) {
      return;
    }

    if (element.innerHTML !== plainHtml) {
      logScriptLineFocusDebug('contentEditable DOM sync from props', {
        lineId: line.id,
        isEditing,
        currentDomLength: element.innerHTML.length,
        nextDomLength: plainHtml.length,
        activeElement: getActiveElementDebugInfo(),
      });
      element.innerHTML = plainHtml;
    }
  }, [isEditing, line.id, plainHtml]);

  const contentEditablePresentation = getScriptLineContentEditablePresentation({
    character,
    isSilentLine,
  });

  return {
    contentEditableRef,
    contentEditablePresentation,
    handleDivFocus,
    handleDivBlur,
    handleInput,
  };
};
