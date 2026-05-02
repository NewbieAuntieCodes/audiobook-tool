const isEditorFocusDebugEnabled = () =>
  process.env.NODE_ENV === 'development' ||
  (() => {
    try {
      return (
        typeof window !== 'undefined' &&
        window.localStorage.getItem('__editor_focus_debug__') === '1'
      );
    } catch (_) {
      return false;
    }
  })();

export const getActiveElementDebugInfo = () => {
  if (typeof document === 'undefined') {
    return {
      tagName: '',
      ariaLabel: '',
      isContentEditable: false,
      className: '',
    };
  }

  const activeElement = document.activeElement as HTMLElement | null;
  return {
    tagName: activeElement?.tagName || '',
    ariaLabel: activeElement?.getAttribute('aria-label') || '',
    isContentEditable: activeElement?.isContentEditable || false,
    className: activeElement?.className || '',
  };
};

export const logEditorFocusDebug = (
  message: string,
  payload: Record<string, unknown>
) => {
  if (!isEditorFocusDebugEnabled()) {
    return;
  }

  console.info('[EditorFocusDebug]', message, payload);
};
