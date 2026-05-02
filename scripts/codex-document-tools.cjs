const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');

const AVAILABLE_COLORS = [
  'bg-red-500',
  'bg-blue-500',
  'bg-green-500',
  'bg-yellow-400',
  'bg-purple-600',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-teal-500',
];

const AVAILABLE_TEXT_COLORS = [
  'text-red-100',
  'text-blue-100',
  'text-green-100',
  'text-yellow-800',
  'text-purple-100',
  'text-pink-100',
  'text-indigo-100',
  'text-teal-100',
];

const FULL_BRACKET_DIALOGUE_REGEX = /^\s*[【\[]\s*([\s\S]*?)\s*[】\]]\s*$/;

function sanitizeCharacterDisplayName(name) {
  return String(name || '')
    .replace(/^[\s\u3000]+|[\s\u3000]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCharacterNameKey(name) {
  return sanitizeCharacterDisplayName(name).toLowerCase();
}

function createCharacterFactory() {
  const characters = [];
  const characterMap = new Map();
  const charactersWithCvToUpdate = new Map();
  const characterDescriptions = new Map();

  function getCharacter(nameAndCv) {
    let charName = sanitizeCharacterDisplayName(nameAndCv);
    let cvName;

    const parts = charName.split(/[-\u2013\u2014\u2212\uFF0D]/);
    if (parts.length > 1) {
      const potentialCv = sanitizeCharacterDisplayName(parts[0]);
      const potentialCharName = sanitizeCharacterDisplayName(parts.slice(1).join('-'));
      if (potentialCv && potentialCharName) {
        cvName = potentialCv;
        charName = potentialCharName;
      }
    }

    const normalized = charName.replace(/^[\[【]\s*|[\]】]\s*$/g, '').trim();
    if (/^(静音|silence|mute)$/i.test(normalized)) {
      charName = '[静音]';
      cvName = undefined;
    } else if (/^(\[?音效\]?|sfx|fx|音效描述)$/i.test(normalized)) {
      charName = '[音效]';
      cvName = undefined;
    }

    const key = normalizeCharacterNameKey(charName);
    const existing = characterMap.get(key);
    if (existing) {
      if (cvName && (!existing.cvName || existing.cvName.toLowerCase() !== cvName.toLowerCase())) {
        charactersWithCvToUpdate.set(existing.id, cvName);
      }
      return existing;
    }

    const colorIndex = characters.length % AVAILABLE_COLORS.length;
    const isNarrator = charName.toLowerCase() === 'narrator';
    const isSilence = charName === '[静音]';
    const isSfx = charName === '[音效]' || charName === '音效';

    const character = {
      id: `char_${characters.length + 1}_${key || 'unknown'}`,
      name: charName,
      color: isNarrator ? 'bg-slate-500' : isSilence ? 'bg-slate-700' : isSfx ? 'bg-transparent' : AVAILABLE_COLORS[colorIndex],
      textColor: isNarrator
        ? 'text-slate-100'
        : isSilence
          ? 'text-slate-400'
          : isSfx
            ? 'text-red-500'
            : AVAILABLE_TEXT_COLORS[colorIndex],
      cvName: isSilence || isSfx ? '' : cvName || '',
      description: isSilence
        ? '用于标记无需录制的旁白提示'
        : isSfx
          ? '用于标记音效的文字描述'
          : '',
      isStyleLockedToCv: isSilence || isSfx,
      status: 'active',
    };

    if (cvName && (!character.cvName || character.cvName.toLowerCase() !== cvName.toLowerCase())) {
      charactersWithCvToUpdate.set(character.id, cvName);
    }

    characters.push(character);
    characterMap.set(key, character);
    return character;
  }

  function setCharacterDescription(name, description) {
    const normalizedName = sanitizeCharacterDisplayName(name);
    const normalizedDescription = sanitizeCharacterDisplayName(description);
    if (!normalizedName || !normalizedDescription) return;
    characterDescriptions.set(normalizedName, normalizedDescription);
  }

  return {
    characters,
    charactersWithCvToUpdate,
    characterDescriptions,
    getCharacter,
    setCharacterDescription,
  };
}

function isNoise(text) {
  const normalized = sanitizeCharacterDisplayName(text);
  if (!normalized) return true;
  if (/^【?待识别角色】?$/.test(normalized)) return true;
  if (/^[\u2026\.。·！？!?,，、;；：:…\s]+$/.test(normalized)) return true;
  return false;
}

function parseImportedScriptToChapters(rawText) {
  if (!rawText || !String(rawText).trim()) {
    return {
      newChapters: [],
      characters: [],
      charactersWithCvToUpdate: {},
      characterDescriptions: {},
    };
  }

  const lines = String(rawText).split(/\r?\n/);
  const newChapters = [];
  let currentChapterContent = [];
  let currentChapterTitle = '未命名章节 1';
  let chapterCounter = 1;
  const chapterTitleLineRegex =
    /^(?:##\d+\s*\.\s*)?(Chapter\s+\d+|Part\s+\d+|第\s*[一二三四五六七八九十百千万零\d]+\s*[章章节回卷篇部]|楔子|序章|引子|尾声|Prologue|Epilogue|前言|后记)/i;

  const factory = createCharacterFactory();

  function saveCurrentChapter() {
    if (currentChapterContent.length === 0) return;

    const characterById = new Map(factory.characters.map((character) => [character.id, character]));
    const rawContent = currentChapterContent
      .map((line) => {
        const character = characterById.get(line.characterId);
        if (character && character.name.toLowerCase() !== 'narrator') {
          return `【${character.name}】${line.text}`;
        }
        return line.text;
      })
      .join('\n');

    newChapters.push({
      id: `imported_ch_${chapterCounter}`,
      title: currentChapterTitle,
      rawContent,
      scriptLines: currentChapterContent,
    });

    chapterCounter += 1;
    currentChapterTitle = `未命名章节 ${chapterCounter}`;
    currentChapterContent = [];
  }

  for (const line of lines) {
    const trimmedLine = sanitizeCharacterDisplayName(
      String(line || '')
        .replace(/\uFEFF/g, '')
        .replace(/\u00A0/g, ' ')
        .replace(/\u200B/g, '')
    );
    if (!trimmedLine || isNoise(trimmedLine)) continue;

    if (chapterTitleLineRegex.test(trimmedLine)) {
      saveCurrentChapter();
      currentChapterTitle = trimmedLine;
      continue;
    }

    const bracketMatch = trimmedLine.match(/^\s*[\u3010\[](.+?)[\u3011\]]\s*([\s\S]*)/);
    const soundTypeRegex = /^\s*[\(（]([^）)]+)[)）]\s*/;

    let character;
    let text;
    let soundType;

    if (bracketMatch) {
      const charName = sanitizeCharacterDisplayName(bracketMatch[1]);
      let textAfterTag = sanitizeCharacterDisplayName(bracketMatch[2]);
      textAfterTag = textAfterTag.replace(/^[\u3011\]\s]+/, '').trim();
      const soundTypeMatch = textAfterTag.match(soundTypeRegex);
      if (soundTypeMatch) {
        soundType = sanitizeCharacterDisplayName(soundTypeMatch[1]);
        text = sanitizeCharacterDisplayName(textAfterTag.replace(soundTypeRegex, ''));
      } else {
        text = textAfterTag;
      }
      character = factory.getCharacter(charName);
    } else {
      const soundTypeMatch = trimmedLine.match(soundTypeRegex);
      if (soundTypeMatch) {
        soundType = sanitizeCharacterDisplayName(soundTypeMatch[1]);
        text = sanitizeCharacterDisplayName(trimmedLine.replace(soundTypeRegex, ''));
      } else {
        text = trimmedLine;
      }
      character = factory.getCharacter('Narrator');
    }

    if (isNoise(text)) continue;

    currentChapterContent.push({
      id: `imported_line_${chapterCounter}_${currentChapterContent.length + 1}`,
      text,
      characterId: character.id,
      soundType,
      isAiAudioLoading: false,
      isAiAudioSynced: false,
      isTextModifiedManual: false,
    });
  }

  saveCurrentChapter();

  return {
    newChapters,
    characters: factory.characters,
    charactersWithCvToUpdate: Object.fromEntries(factory.charactersWithCvToUpdate.entries()),
    characterDescriptions: Object.fromEntries(factory.characterDescriptions.entries()),
  };
}

function decodeHtmlText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, '')
    .trim();
}

function parseHtmlWorkbook(htmlString) {
  const html = String(htmlString || '');
  const factory = createCharacterFactory();
  const newChapters = [];

  const descriptionSectionMatch = html.match(/<h2[^>]*>\s*主要角色介绍\s*<\/h2>([\s\S]*?)(?=<h2[^>]*>|<\/body>|$)/i);
  if (descriptionSectionMatch) {
    const paragraphMatches = descriptionSectionMatch[1].match(/<p[\s\S]*?<\/p>/gi) || [];
    for (const paragraph of paragraphMatches) {
      const nameMatch = paragraph.match(/【([^】]+)】/);
      const text = decodeHtmlText(paragraph).replace(/^【[^】]+】[:：]?\s*/, '');
      if (nameMatch && text) {
        factory.setCharacterDescription(nameMatch[1], text);
      }
    }
  }

  const chapterMatches = html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2[^>]*>|<\/body>|$)/gi);
  let chapterCounter = 1;
  for (const match of chapterMatches) {
    const title = decodeHtmlText(match[1]);
    if (!title || title === '主要角色介绍') continue;

    const blockHtml = match[2] || '';
    const lineMatches = blockHtml.match(/<div[^>]*class=["'][^"']*line[^"']*["'][^>]*>[\s\S]*?<\/div>/gi) || [];
    const rawContentParts = [];
    const scriptLines = [];

    for (const lineHtml of lineMatches) {
      const fullText = decodeHtmlText(lineHtml)
        .replace(/\uFEFF/g, '')
        .replace(/\u00A0/g, ' ')
        .replace(/\u200B/g, '')
        .trim();

      rawContentParts.push(fullText);
      if (!fullText) continue;

      const bracketMatch = fullText.match(/^\s*[\u3010\[](.+?)[\u3011\]]\s*([\s\S]*)/);
      const soundTypeRegex = /^\s*[\(（]([^）)]+)[)）]\s*/;
      let character;
      let text;
      let soundType;

      if (bracketMatch) {
        const speakerTag = sanitizeCharacterDisplayName(bracketMatch[1]);
        let textAfterTag = sanitizeCharacterDisplayName(bracketMatch[2]).replace(/^[\u3011\]\s]+/, '').trim();
        const soundTypeMatch = textAfterTag.match(soundTypeRegex);
        if (soundTypeMatch) {
          soundType = sanitizeCharacterDisplayName(soundTypeMatch[1]);
          text = sanitizeCharacterDisplayName(textAfterTag.replace(soundTypeRegex, ''));
        } else {
          text = textAfterTag;
        }
        character = factory.getCharacter(speakerTag);
      } else {
        const soundTypeMatch = fullText.match(soundTypeRegex);
        if (soundTypeMatch) {
          soundType = sanitizeCharacterDisplayName(soundTypeMatch[1]);
          text = sanitizeCharacterDisplayName(fullText.replace(soundTypeRegex, ''));
        } else {
          text = fullText;
        }
        character = factory.getCharacter('Narrator');
      }

      if (!text || isNoise(text)) continue;
      scriptLines.push({
        id: `html_line_${chapterCounter}_${scriptLines.length + 1}`,
        text,
        characterId: character.id,
        soundType,
        isAiAudioLoading: false,
        isAiAudioSynced: false,
        isTextModifiedManual: false,
      });
    }

    if (scriptLines.length > 0) {
      newChapters.push({
        id: `html_ch_${chapterCounter}`,
        title,
        rawContent: rawContentParts.join('\n'),
        scriptLines,
      });
      chapterCounter += 1;
    }
  }

  return {
    newChapters,
    characters: factory.characters,
    charactersWithCvToUpdate: Object.fromEntries(factory.charactersWithCvToUpdate.entries()),
    characterDescriptions: Object.fromEntries(factory.characterDescriptions.entries()),
  };
}

async function readDocumentSource(filePath) {
  const absolutePath = path.resolve(filePath);
  const fileNameLower = absolutePath.toLowerCase();

  if (fileNameLower.endsWith('.doc') && !fileNameLower.endsWith('.docx')) {
    throw new Error('不支持旧版 .doc 格式，请先另存为 .docx。');
  }

  if (fileNameLower.endsWith('.txt')) {
    return {
      kind: 'txt',
      text: fs.readFileSync(absolutePath, 'utf8'),
    };
  }

  if (fileNameLower.endsWith('.docx')) {
    const buffer = fs.readFileSync(absolutePath);
    const headText = buffer.slice(0, 1024).toString('utf8').replace(/^\uFEFF/, '');
    const isZipLike = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
    const isHtmlLike = /<(?:!doctype\s+html|html|head|meta\s+charset)/i.test(headText);

    if (isHtmlLike || !isZipLike) {
      return {
        kind: 'html-workbook',
        text: buffer.toString('utf8'),
      };
    }

    const result = await mammoth.extractRawText({ buffer });
    return {
      kind: 'docx',
      text: result.value,
    };
  }

  throw new Error('不支持的文件格式。当前仅支持 .txt / .docx。');
}

async function parseWorkbookDocumentFromFile(filePath, options = {}) {
  const source = await readDocumentSource(filePath);
  const parsed =
    source.kind === 'html-workbook'
      ? parseHtmlWorkbook(source.text)
      : parseImportedScriptToChapters(source.text);

  const chapterStart = Number.isInteger(options.chapterStart) && options.chapterStart > 0 ? options.chapterStart : 1;
  const chapterEnd =
    Number.isInteger(options.chapterEnd) && options.chapterEnd >= chapterStart
      ? options.chapterEnd
      : parsed.newChapters.length;
  const includeRawContent = options.includeRawContent !== false;

  const slicedChapters = parsed.newChapters.slice(chapterStart - 1, chapterEnd).map((chapter, index) => ({
    chapterIndex: chapterStart + index,
    id: chapter.id,
    title: chapter.title,
    ...(includeRawContent ? { rawContent: chapter.rawContent } : {}),
    scriptLines: chapter.scriptLines.map((line, lineIndex) => {
      const character = parsed.characters.find((item) => item.id === line.characterId);
      return {
        lineIndex,
        id: line.id,
        text: line.text,
        originalText: line.originalText || '',
        characterId: line.characterId || '',
        characterName: character?.name || '',
        cvName: character?.cvName || '',
        soundType: line.soundType || '',
      };
    }),
  }));

  return {
    sourceType: source.kind,
    filePath: path.resolve(filePath),
    chapterCount: parsed.newChapters.length,
    returnedChapterCount: slicedChapters.length,
    lineCount: parsed.newChapters.reduce((sum, chapter) => sum + chapter.scriptLines.length, 0),
    characters: parsed.characters,
    charactersWithCvToUpdate: parsed.charactersWithCvToUpdate,
    characterDescriptions: parsed.characterDescriptions,
    chapters: slicedChapters,
  };
}

function parseStep1ScriptLines(rawText) {
  const outputSegments = [];
  const lines = String(rawText || '').split(/\r?\n/);
  const dialogueStart = '“';
  const dialogueEnd = '”';

  for (const line of lines) {
    const fullBracketDialogueMatch = line.match(FULL_BRACKET_DIALOGUE_REGEX);
    if (fullBracketDialogueMatch) {
      const text = line.trim();
      const originalText = sanitizeCharacterDisplayName(fullBracketDialogueMatch[1]);
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
    while (currentPos < line.length) {
      const nextDialogueStart = line.indexOf(dialogueStart, currentPos);

      if (nextDialogueStart === -1) {
        const narration = line.substring(currentPos).trim();
        if (narration) {
          outputSegments.push({ text: narration, originalText: narration, isDialogue: false });
        }
        break;
      }

      const narrationBefore = line.substring(currentPos, nextDialogueStart).trim();
      if (narrationBefore) {
        outputSegments.push({ text: narrationBefore, originalText: narrationBefore, isDialogue: false });
      }

      const nextDialogueEnd = line.indexOf(dialogueEnd, nextDialogueStart + 1);
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

      outputSegments.push({
        text: line.substring(nextDialogueStart, nextDialogueEnd + 1),
        originalText: line.substring(nextDialogueStart + 1, nextDialogueEnd),
        isDialogue: true,
      });

      currentPos = nextDialogueEnd + 1;
    }
  }

  const scriptLines = [];
  for (const segment of outputSegments) {
    const characterName = segment.isDialogue ? '待识别角色' : 'Narrator';
    const previous = scriptLines[scriptLines.length - 1];
    if (!segment.isDialogue && previous && previous.characterName === 'Narrator') {
      previous.text += `\n${segment.text}`;
      previous.originalText = previous.originalText
        ? `${previous.originalText}\n${segment.text}`
        : segment.text;
      continue;
    }

    scriptLines.push({
      id: `step1_line_${scriptLines.length + 1}`,
      text: segment.text,
      originalText: segment.originalText || '',
      characterName,
      cvName: '',
    });
  }

  return {
    lineCount: scriptLines.length,
    scriptLines,
  };
}

function parseAnnotatedTextToAnnotationMap(annotatedText) {
  const annotationMap = new Map();
  let match;

  const legacyRegex = /▽(.*?)▼※([\s\S]*?)§/g;
  while ((match = legacyRegex.exec(annotatedText)) !== null) {
    const speakerTag = sanitizeCharacterDisplayName(match[1]);
    const dialogueContent = match[2];
    let charName = speakerTag;
    let cvName = '';
    const parts = speakerTag.split(/[-ㄜ每〞]/);
    if (parts.length > 1) {
      const potentialCv = sanitizeCharacterDisplayName(parts[0]);
      const potentialCharName = sanitizeCharacterDisplayName(parts.slice(1).join('-'));
      if (potentialCv && potentialCharName) {
        cvName = potentialCv;
        charName = potentialCharName;
      }
    }
    annotationMap.set(dialogueContent, { charName, cvName });
  }

  const bracketQuoteRegex = /[【\[]([^【\]\]\r\n]+)[】\]]\s*(?:[:：])?\s*(?:“([\s\S]*?)”|\"([\s\S]*?)\")/g;
  while ((match = bracketQuoteRegex.exec(annotatedText)) !== null) {
    const speakerTag = sanitizeCharacterDisplayName(match[1]);
    const dialogueContent = match[2] || match[3] || '';
    if (!dialogueContent) continue;
    let charName = speakerTag;
    let cvName = '';
    const parts = speakerTag.split(/[-ㄜ每〞]/);
    if (parts.length > 1) {
      const potentialCv = sanitizeCharacterDisplayName(parts[0]);
      const potentialCharName = sanitizeCharacterDisplayName(parts.slice(1).join('-'));
      if (potentialCv && potentialCharName) {
        cvName = potentialCv;
        charName = potentialCharName;
      }
    }

    if (!annotationMap.has(dialogueContent)) {
      annotationMap.set(dialogueContent, { charName, cvName });
    }
  }

  return annotationMap;
}

function applyStep2AnnotationText(lines, annotatedText) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const annotationMap = parseAnnotatedTextToAnnotationMap(String(annotatedText || ''));
  const assignments = [];
  const unmatchedLineIds = [];

  for (const line of safeLines) {
    const lineText = typeof line.text === 'string' ? line.text : '';
    const originalText = typeof line.originalText === 'string' ? line.originalText : '';
    let dialogueContent = null;

    const markerMatch = lineText.match(/※([\s\S]*)§/);
    if (markerMatch) {
      dialogueContent = markerMatch[1];
    } else if (originalText.trim()) {
      dialogueContent = originalText;
    } else {
      const quoteMatch = lineText.match(/“([\s\S]*?)”|\"([\s\S]*?)\"/);
      if (quoteMatch) {
        dialogueContent = quoteMatch[1] || quoteMatch[2] || null;
      }
    }

    if (!dialogueContent) {
      unmatchedLineIds.push(line.id || '');
      continue;
    }

    const annotation = annotationMap.get(dialogueContent);
    if (!annotation) {
      unmatchedLineIds.push(line.id || '');
      continue;
    }

    assignments.push({
      lineId: line.id || '',
      text: lineText,
      originalText,
      matchedDialogue: dialogueContent,
      characterName: annotation.charName || '待识别角色',
      cvName: annotation.cvName || '',
    });
  }

  return {
    lineCount: safeLines.length,
    matchedCount: assignments.length,
    unmatchedCount: unmatchedLineIds.filter(Boolean).length,
    unmatchedLineIds: unmatchedLineIds.filter(Boolean),
    assignments,
  };
}

module.exports = {
  parseImportedScriptToChapters,
  parseHtmlWorkbook,
  parseWorkbookDocumentFromFile,
  parseStep1ScriptLines,
  applyStep2AnnotationText,
  readDocumentSource,
};
