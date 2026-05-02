export interface ParsedAnnotatedSpeaker {
  charName: string;
  cvName?: string;
}

const splitSpeakerTag = (speakerTag: string): ParsedAnnotatedSpeaker => {
  let charName = speakerTag.trim();
  let cvName: string | undefined;

  const parts = charName.split(/[-ㄜ每〞]/);
  if (parts.length > 1) {
    const potentialCv = parts[0].trim();
    const potentialCharName = parts.slice(1).join('-').trim();
    if (potentialCv && potentialCharName) {
      cvName = potentialCv;
      charName = potentialCharName;
    }
  }

  return { charName, cvName };
};

export const parsePreAnnotatedSpeakerMap = (annotatedText: string) => {
  const annotationMap = new Map<string, ParsedAnnotatedSpeaker>();

  const markerRegex = /▽(.*?)▼※([\s\S]*?)§/g;
  let match: RegExpExecArray | null;
  while ((match = markerRegex.exec(annotatedText)) !== null) {
    const speakerTag = match[1].trim();
    const dialogueContent = match[2];
    annotationMap.set(dialogueContent, splitSpeakerTag(speakerTag));
  }

  const bracketQuoteRegex =
    /[【\[]([^【\]\]\r\n]+)[】\]]\s*(?:[:：])?\s*(?:“([\s\S]*?)”|"([\s\S]*?)")/g;
  while ((match = bracketQuoteRegex.exec(annotatedText)) !== null) {
    const speakerTag = match[1].trim();
    const dialogueContent = match[2] ?? match[3] ?? '';
    if (!dialogueContent || annotationMap.has(dialogueContent)) {
      continue;
    }
    annotationMap.set(dialogueContent, splitSpeakerTag(speakerTag));
  }

  return annotationMap;
};

export const resolveDialogueContentForAnnotatedLine = (
  text: string,
  originalText?: string
) => {
  const markerMatch = text.match(/※([\s\S]*)§/);
  if (markerMatch) {
    return markerMatch[1];
  }

  if (originalText && originalText.trim()) {
    return originalText;
  }

  const quoteMatch = text.match(/“([\s\S]*?)”|"([\s\S]*?)"/);
  return quoteMatch ? quoteMatch[1] ?? quoteMatch[2] ?? null : null;
};
