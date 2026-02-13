import React, { useEffect, useState, useRef, useLayoutEffect, useMemo, useCallback } from 'react';
import { Chapter, Character, TextMarker, SoundLibraryItem, Project, IgnoredSoundKeyword } from '../../../types';
import { useMarkerRendering } from '../hooks/useMarkerRendering';
import { MusicalNoteIcon, ChevronDownIcon } from '../../../components/ui/icons';
import { useSoundHighlighter } from '../../scriptEditor/hooks/useSoundHighlighter';
import SoundKeywordPopover from '../../scriptEditor/components/script_editor_panel/SoundKeywordPopover';
import ChapterPagination from '../../scriptEditor/components/chapter_list_panel/ChapterPagination';
import BgmPopover from './BgmPopover';

const formatChapterNumber = (index: number) => {
  if (index < 0) return '';
  const number = index + 1;
  return number < 1000 ? String(number).padStart(3, '0') : String(number);
};

interface DialogueContentProps {
  chapters: Chapter[];
  allProjectChapters: Chapter[];
  characters: Character[];
  onTextSelect: (range: Range | null) => void;
  textMarkers: TextMarker[];
  suspendLayout?: boolean;
  soundLibrary: SoundLibraryItem[];
  soundObservationList: string[];
  expandedChapterId: string | null;
  setExpandedChapterId: (id: string | null) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onContextMenuRequest: (event: React.MouseEvent, range: Range) => void;
  currentProject: Project | null;
  onPinSound: (lineId: string, chapterId: string, charIndex: number, keyword: string, soundId: number | null, soundName: string | null) => void;
  onUpdateLineText: (projectId: string, chapterId: string, lineId: string, newText: string) => Promise<void>;
  onOpenEditMarker: (marker: TextMarker | null) => void;
}

interface HighlightedLineProps {
    lineId: string;
    chapterId: string;
    text: string;
    soundLibrary: SoundLibraryItem[];
    soundObservationList: string[];
    ignoredKeywords?: IgnoredSoundKeyword[];
    onUpdateText: (chapterId: string, lineId: string, newText: string) => void;
}

const HighlightedLine: React.FC<HighlightedLineProps> = ({ lineId, chapterId, text, soundLibrary, soundObservationList, ignoredKeywords, onUpdateText }) => {
    // 清理已写入文本中的前缀（如 "♫-" / "♪-" 重复），只保留 <关键词>
    const sanitizedText = React.useMemo(() => {
        try {
            return (text || '').replace(/<([^<>]+)>/g, (m, inner) => {
                const cleaned = String(inner).replace(/^(?:[\u266A\u266B]-)+/, '');
                return `<${cleaned}>`;
            });
        } catch {
            return text;
        }
    }, [text]);
    const highlightedHtml = useSoundHighlighter(sanitizedText, soundLibrary, soundObservationList, ignoredKeywords);
    const pRef = useRef<HTMLParagraphElement>(null);

    useLayoutEffect(() => {
        const el = pRef.current;
        if (!el) return;
        // 为了保证标记即时可视化，这里直接刷新高亮
        if (el.innerHTML !== highlightedHtml) {
            el.innerHTML = highlightedHtml;
        }
    }, [highlightedHtml]);

    const handleBlur = () => {
        const el = pRef.current;
        if (!el) return;

        // innerText preserves line breaks from <br> tags, but strips all other HTML (which is what we want)
        const newPlainText = el.innerText;
        
        if (newPlainText !== text) {
            onUpdateText(chapterId, lineId, newPlainText);
        }
    };
    
    return <p 
        ref={pRef}
        className="flex-grow leading-relaxed whitespace-pre-wrap outline-none" 
        onBlur={handleBlur}
        // 内容可编辑由外层容器统一托管，以支持跨段落选择
    />;
};

export const DialogueContent: React.FC<DialogueContentProps> = ({
  chapters,
  allProjectChapters,
  characters,
  onTextSelect,
  textMarkers,
  suspendLayout,
  soundLibrary,
  soundObservationList,
  expandedChapterId,
  setExpandedChapterId,
  currentPage,
  totalPages,
  onPageChange,
  onContextMenuRequest,
  currentProject,
  onPinSound,
  onUpdateLineText,
  onOpenEditMarker,
}) => {
    const { contentRef, bgmLabelOverlays } = useMarkerRendering(textMarkers, chapters, suspendLayout, expandedChapterId);
    const [popoverState, setPopoverState] = useState<{ visible: boolean; keyword: string; top: number; left: number; lineId: string; chapterId: string; index: number; } | null>(null);
    const hidePopoverTimeout = useRef<number | null>(null);
    const [bgmPopoverState, setBgmPopoverState] = useState<{ visible: boolean; keyword: string; top: number; left: number; lineId: string; chapterId: string; index: number; } | null>(null);
    const hideBgmPopoverTimeout = useRef<number | null>(null);
    
    const processedChaptersWithHighlight = useMemo(() => {
        return chapters.map(chapter => {
            // 每个章节内部单独计算 BGM 范围：
            // 起始行 = 含有 <BGM> 的行，结束行 = 含有 // 的行。
            let isInMusicRange = false;

            const newScriptLines = chapter.scriptLines.map(line => {
                const bgmRegex = /<[^<>]+>/;
                const endMarker = '//';
                
                const hasStart = bgmRegex.test(line.text);
                const hasEnd = line.text.includes(endMarker);
    
                let shouldHighlight = false;
    
                if (isInMusicRange) { // We are already in a range
                    shouldHighlight = true;
                    if (hasEnd) {
                        isInMusicRange = false; // The range ends AFTER this line
                    }
                } else { // We are NOT in a range
                    if (hasStart) {
                        shouldHighlight = true;
                        if (!hasEnd) {
                            isInMusicRange = true; // The range starts here and CONTINUES
                        }
                        // if hasStart and hasEnd, range is just this line, isInMusicRange remains false.
                    }
                }
                return { ...line, shouldHighlight };
            });
            return { ...chapter, scriptLines: newScriptLines };
        });
    }, [chapters]);

    const handleLineTextUpdate = useCallback((chapterId: string, lineId: string, newText: string) => {
        if (currentProject) {
            onUpdateLineText(currentProject.id, chapterId, lineId, newText);
        }
    }, [currentProject, onUpdateLineText]);

    const handleMouseUp = () => {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            onTextSelect(null);
            return;
        }
        const anchor = selection.anchorNode;
        const focus = selection.focusNode;
        const root = contentRef.current;
        // 放宽：只要起点或终点在文本容器内，就接收该选择（支持跨段落、多行）
        if (root && (root.contains(anchor) || root.contains(focus))) {
            onTextSelect(selection.getRangeAt(0));
        } else {
            onTextSelect(null);
        }
    };

    const handleMouseOver = (e: React.MouseEvent) => {
        if (hidePopoverTimeout.current) clearTimeout(hidePopoverTimeout.current);
        if (hideBgmPopoverTimeout.current) clearTimeout(hideBgmPopoverTimeout.current);

        const target = e.target as HTMLElement;

        if (target.classList.contains('sound-keyword-highlight')) {
            const keyword = target.dataset.keyword;
            const indexStr = target.dataset.index;
            const lineEl = target.closest('[data-line-id]') as HTMLElement;
            const lineId = lineEl?.dataset.lineId;
            const chapterEl = target.closest('[data-chapter-id]') as HTMLElement;
            const chapterId = chapterEl?.dataset.chapterId;
            if (keyword && lineId && indexStr && chapterId) {
                const rect = target.getBoundingClientRect();
                setPopoverState({ visible: true, keyword, top: rect.bottom, left: rect.left, lineId, chapterId, index: parseInt(indexStr, 10) });
            }
        } else if (target.classList.contains('bgm-marker-inline')) {
            const keyword = target.dataset.bgmName;
            if (keyword) {
                const rect = target.getBoundingClientRect();
                setBgmPopoverState({ visible: true, keyword, top: rect.bottom, left: rect.left, lineId: '', chapterId: '', index: 0 }); // Placeholder
            }
        }
    };
    
    const handleMouseOut = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('sound-keyword-highlight')) {
            hidePopoverTimeout.current = window.setTimeout(() => {
                setPopoverState(null);
            }, 200);
        } else if (target.classList.contains('bgm-marker-inline')) {
            hideBgmPopoverTimeout.current = window.setTimeout(() => {
                setBgmPopoverState(null);
            }, 200);
        }
    };

    // Click to toggle popovers (preferred UX)
    const handleMarkerClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        const root = contentRef.current;
        if (!root || !root.contains(target)) return;

        if (target.classList.contains('sound-keyword-highlight')) {
            const keyword = target.dataset.keyword;
            const indexStr = target.dataset.index;
            const lineEl = target.closest('[data-line-id]') as HTMLElement | null;
            const chapterEl = target.closest('[data-chapter-id]') as HTMLElement | null;
            if (keyword && indexStr && lineEl && chapterEl) {
                const rect = target.getBoundingClientRect();
                setPopoverState({ visible: true, keyword, top: rect.bottom, left: rect.left, lineId: lineEl.dataset.lineId!, chapterId: chapterEl.dataset.chapterId!, index: parseInt(indexStr, 10) });
            }
        } else if (target.classList.contains('bgm-marker-inline')) {
            const keyword = target.getAttribute('data-bgm-name');
            const indexStr = target.getAttribute('data-index');
            const lineEl = target.closest('[data-line-id]') as HTMLElement | null;
            const chapterEl = target.closest('[data-chapter-id]') as HTMLElement | null;
            if (keyword && indexStr && lineEl && chapterEl) {
                const rect = target.getBoundingClientRect();
                setBgmPopoverState({ visible: true, keyword, top: rect.bottom, left: rect.left, lineId: lineEl.dataset.lineId!, chapterId: chapterEl.dataset.chapterId!, index: parseInt(indexStr, 10) });
            }
        } else {
            // click blank area closes
            setPopoverState(null);
            setBgmPopoverState(null);
        }
    };
    
    const handlePopoverEnter = () => {
        if (hidePopoverTimeout.current) clearTimeout(hidePopoverTimeout.current);
    };

    const handleBgmPopoverEnter = () => {
        if (hideBgmPopoverTimeout.current) clearTimeout(hideBgmPopoverTimeout.current);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        
        let range: Range | null = null;
        
        // Standard method
        if ((document as any).caretPositionFromPoint) {
            const pos = (document as any).caretPositionFromPoint(e.clientX, e.clientY);
            if(pos){
                range = document.createRange();
                range.setStart(pos.offsetNode, pos.offset);
                range.collapse(true);
            }
        // Non-standard fallback for some WebKit browsers
        } else if ((document as any).caretRangeFromPoint) {
            range = (document as any).caretRangeFromPoint(e.clientX, e.clientY);
        }
        
        if (range && contentRef.current?.contains(range.startContainer)) {
             range.collapse(true);
             onContextMenuRequest(e, range);
        }
    };

    // 行首保护：禁止段首 Backspace 与跨行删除
    const findLineIdAndOffset = useCallback((container: Node, offset: number): { lineId: string; offset: number } | null => {
        const lineElement = (
          container.nodeType === Node.ELEMENT_NODE ? (container as Element) : (container.parentElement as Element | null)
        )?.closest('[data-line-id]');
        if (!lineElement) return null;
        const lineId = (lineElement as HTMLElement).dataset.lineId!;
        const pElement = lineElement.querySelector('p');
        if (!pElement) return null;
        const range = document.createRange();
        range.selectNodeContents(pElement);
        try { range.setEnd(container, offset); } catch {}
        const calculatedOffset = range.toString().length;
        return { lineId, offset: calculatedOffset };
    }, []);

    const isSelectionInsideContent = useCallback(() => {
        const root = contentRef.current;
        const sel = window.getSelection();
        if (!root || !sel || sel.rangeCount === 0) return false;
        const r = sel.getRangeAt(0);
        return root.contains(r.startContainer) && root.contains(r.endContainer);
    }, [contentRef]);

    const handleBeforeInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
        const anyEvt = e as unknown as { nativeEvent?: any };
        const inputType: string | undefined = anyEvt?.nativeEvent?.inputType;
        if (!inputType) return;
        const isBackwardDelete = inputType === 'deleteContentBackward' || inputType === 'deleteWordBackward' || inputType === 'deleteSoftLineBackward' || inputType === 'deleteHardLineBackward';
        const isInsertParagraph = inputType === 'insertParagraph' || inputType === 'insertLineBreak';
        const isDeleteByCut = inputType === 'deleteByCut';
        
        // 禁用分行：阻止所有回车/软换行
        if (isInsertParagraph) {
            e.preventDefault();
            return;
        }

        if (!isBackwardDelete && !isDeleteByCut) return;
        if (!isSelectionInsideContent()) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const s = findLineIdAndOffset(range.startContainer, range.startOffset);
        const eInfo = findLineIdAndOffset(range.endContainer, range.endOffset);
        if (!s || !eInfo) return;
        // 禁止跨行删除
        if (!range.collapsed && s.lineId !== eInfo.lineId) {
            e.preventDefault();
            return;
        }
        // 禁止段首 Backspace
        if (range.collapsed && isBackwardDelete && s.offset === 0) {
            e.preventDefault();
            return;
        }
    }, [isSelectionInsideContent, findLineIdAndOffset]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        // 禁用回车，兜底
        if (e.key === 'Enter') { e.preventDefault(); return; }
        if (e.key !== 'Backspace') return;
        if (!isSelectionInsideContent()) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const s = findLineIdAndOffset(range.startContainer, range.startOffset);
        const eInfo = findLineIdAndOffset(range.endContainer, range.endOffset);
        if (!s || !eInfo) return;
        if (!range.collapsed && s.lineId !== eInfo.lineId) {
            e.preventDefault();
            return;
        }
        if (range.collapsed && s.offset === 0) {
            e.preventDefault();
            return;
        }
    }, [isSelectionInsideContent, findLineIdAndOffset]);

    // 粘贴禁换行：将换行转换为空格
    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
        const text = e.clipboardData?.getData('text');
        if (!text) return;
        if (/\r|\n/.test(text)) {
            e.preventDefault();
            const sanitized = text.replace(/[\r\n]+/g, ' ');
            try {
                document.execCommand('insertText', false, sanitized);
            } catch {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) return;
                const range = sel.getRangeAt(0);
                const node = document.createTextNode(sanitized);
                range.deleteContents();
                range.insertNode(node);
                range.setStartAfter(node);
                range.collapse(true);
                sel.removeAllRanges(); sel.addRange(range);
            }
        }
    }, []);

    useEffect(() => {
        if (expandedChapterId) {
            const el = contentRef.current?.querySelector(`[data-chapter-id="${expandedChapterId}"]`);
            if (el) {
                setTimeout(() => {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }
        }
    }, [expandedChapterId]);


    // BGM �ı�ĸ߱�����ͨ�����޸� <...> �� // �����ڵ��������ֶ���ɾ
    // ���������� marker ������ BGM ���ر༭�󴰿�

    const bracketIfNeeded = (text: string) => {
        let t = (text || '').trim();
        if (!t) return '[]';
        // Remove quotes if present
        if ((t.startsWith('“') && t.endsWith('”')) || (t.startsWith('「') && t.endsWith('」'))) {
            t = t.slice(1, -1);
        }
        if (t.startsWith('[') && t.endsWith(']')) return t; // 幂等
        return `[${t}]`;
    };

    const currentPinnedSound = useMemo(() => {
        if (!popoverState || !currentProject) return null;
        const chapter = currentProject.chapters.find(ch => ch.id === popoverState.chapterId);
        const line = chapter?.scriptLines.find(l => l.id === popoverState.lineId);
        if (!line || !line.pinnedSounds) return null;
        return line.pinnedSounds.find(p => p.keyword === popoverState.keyword && p.index === popoverState.index);
    }, [popoverState, currentProject]);

    useEffect(() => {
        if (!currentProject || !contentRef.current) return;

        const applyPinnedClasses = () => {
            const root = contentRef.current;
            if (!root) return;

            currentProject.chapters.forEach(chapter => {
                const chapterEl = root.querySelector(`[data-chapter-id="${chapter.id}"]`);
                if (!chapterEl) return;

                chapter.scriptLines.forEach(line => {
                    const lineEl = chapterEl.querySelector(`[data-line-id="${line.id}"]`);
                    if (!lineEl) return;

                    const markers = lineEl.querySelectorAll<HTMLSpanElement>('span.sound-keyword-highlight[data-keyword][data-index]');
                    markers.forEach(span => {
                        const keyword = span.dataset.keyword || '';
                        const index = span.dataset.index ? parseInt(span.dataset.index, 10) : NaN;
                        if (!keyword || Number.isNaN(index)) return;

                        const isPinned = !!line.pinnedSounds?.some(p => p.keyword === keyword && p.index === index);
                        if (isPinned) {
                            span.classList.add('sound-keyword-highlight--pinned');
                        } else {
                            span.classList.remove('sound-keyword-highlight--pinned');
                        }
                    });
                });
            });
        };

        applyPinnedClasses();
        const timer = window.setTimeout(applyPinnedClasses, 0);

        return () => {
            window.clearTimeout(timer);
        };
    }, [currentProject, chapters]);
    
    const currentPinnedBgm = useMemo(() => {
        if (!bgmPopoverState || !currentProject) return null;
        const chapter = currentProject.chapters.find(ch => ch.id === bgmPopoverState.chapterId);
        const line = chapter?.scriptLines.find(l => l.id === bgmPopoverState.lineId);
        if (!line || !line.pinnedSounds) return null;
        const keyword = `<${bgmPopoverState.keyword}>`;
        return line.pinnedSounds.find(p => p.keyword === keyword && p.index === bgmPopoverState.index);
    }, [bgmPopoverState, currentProject]);

    const handlePinSfx = (soundId: number | null, soundName: string | null) => {
        if (popoverState) {
            onPinSound(popoverState.lineId, popoverState.chapterId, popoverState.index, popoverState.keyword, soundId, soundName);
        }
    }
    
    const handlePinBgm = (soundId: number | null, soundName: string | null) => {
        if (bgmPopoverState) {
            const keyword = `<${bgmPopoverState.keyword}>`;
            onPinSound(bgmPopoverState.lineId, bgmPopoverState.chapterId, bgmPopoverState.index, keyword, soundId, soundName);
        }
    }

    return (
        <div 
            className="relative p-4 h-full flex flex-col" 
            onMouseUp={handleMouseUp}
            onKeyUp={handleMouseUp}
            onClick={handleMarkerClick}
            onContextMenu={handleContextMenu}
        >
            <div 
                className="relative flex-grow overflow-y-auto"
                ref={contentRef}
                contentEditable={true}
                suppressContentEditableWarning={true}
                onBeforeInput={handleBeforeInput}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onInput={(e) => {
                    if (!currentProject) return;
                    const sel = window.getSelection();
                    const anchor = sel && sel.rangeCount > 0 ? sel.anchorNode : e.target as Node;
                    const el = (anchor && anchor.nodeType === Node.ELEMENT_NODE ? anchor as Element : (anchor as any)?.parentElement as (Element | null));
                    const lineEl = el?.closest('[data-line-id]') as HTMLElement | null;
                    const chapterEl = el?.closest('[data-chapter-id]') as HTMLElement | null;
                    if (!lineEl || !chapterEl) return;
                    const lineId = lineEl.dataset.lineId!;
                    const chapterId = chapterEl.dataset.chapterId!;
                    const p = lineEl.querySelector('p');
                    const pEl = p as HTMLElement | null;
                    const newText = pEl ? pEl.innerText : '';
                    // 计算当前光标在该段落内的字符偏移，用于更新后恢复光标
                    let caretOffset = 0;
                    try {
                        if (pEl && sel && sel.rangeCount > 0) {
                            const r = sel.getRangeAt(0);
                            if (lineEl.contains(r.startContainer)) {
                                const measure = document.createRange();
                                measure.selectNodeContents(pEl);
                                measure.setEnd(r.startContainer, r.startOffset);
                                caretOffset = measure.toString().length;
                            }
                        }
                    } catch {}
                    if (newText != null) {
                        onUpdateLineText(currentProject.id, chapterId, lineId, newText);
                        // 下一帧恢复光标到相同字符偏移，避免跳到段首
                        setTimeout(() => {
                            try {
                                const root = contentRef.current;
                                const freshP = root?.querySelector(`[data-line-id="${lineId}"] p`) as HTMLElement | null;
                                if (!freshP) return;
                                // 将偏移映射到节点
                                const walker = document.createTreeWalker(freshP, NodeFilter.SHOW_TEXT);
                                let remain = caretOffset;
                                let node: Node | null = walker.nextNode();
                                while (node) {
                                    const len = (node.nodeValue || '').length;
                                    if (remain <= len) {
                                        const sel2 = window.getSelection();
                                        const r2 = document.createRange();
                                        r2.setStart(node, Math.max(0, Math.min(remain, len)));
                                        r2.collapse(true);
                                        sel2?.removeAllRanges();
                                        sel2?.addRange(r2);
                                        break;
                                    }
                                    remain -= len;
                                    node = walker.nextNode();
                                }
                                // 若未命中任何文本节点，则把光标放在段落末尾
                                if (!node) {
                                    const sel2 = window.getSelection();
                                    const r2 = document.createRange();
                                    r2.selectNodeContents(freshP);
                                    r2.collapse(false);
                                    sel2?.removeAllRanges();
                                    sel2?.addRange(r2);
                                }
                            } catch {}
                        }, 0);
                    }
                }}
            >
                {/* BGM Labels */}
                <div className="absolute inset-0 pointer-events-none z-20">
                    {bgmLabelOverlays.map((overlay) => (
                        <div
                            key={overlay.id}
                            className="bgm-label"
                            style={{
                                top: overlay.top,
                                left: overlay.left,
                                backgroundColor: overlay.bgColor,
                                color: overlay.textColor,
                                // BGM ��ǩ��ת��Ϊ��Ϣչʾ������ͨ�����򵼵� BGM �༭�Ի���
                                pointerEvents: 'none',
                            }}
                            title={`BGM: ${overlay.name}`}
                        >
                            <MusicalNoteIcon className="w-3 h-3 mr-1 flex-shrink-0 mt-0.5" />
                            <div className="flex flex-col">
                                {overlay.displayNameParts.map((part, index) => (
                                    <span key={index} className="truncate w-full">
                                        {part}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {processedChaptersWithHighlight.map((chapter) => {
                    const projectChapterIndex = allProjectChapters.findIndex((c) => c.id === chapter.id);
                    const isExpanded = chapter.id === expandedChapterId;
                    return (
                        <div key={chapter.id} data-chapter-id={chapter.id} className="mb-4 relative">
                            <h4 
                                className="text-lg font-bold text-slate-400 sticky top-0 bg-slate-900/80 backdrop-blur-sm py-2 z-10 border-b border-slate-700 -mx-4 px-4 mb-4 flex items-center justify-between cursor-pointer"
                                onClick={() => setExpandedChapterId(isExpanded ? null : chapter.id)}
                            >
                                <span>{`${formatChapterNumber(projectChapterIndex)} ${chapter.title}`}</span>
                                <ChevronDownIcon className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </h4>
                            {isExpanded && (
                                <div className="space-y-3">
                                      {chapter.scriptLines.map((line: any, index: number) => {
                                          const startingScene = textMarkers.find(m => m.type === 'scene' && m.startLineId === line.id);
                                          const startingSfxGroups = textMarkers.filter(m => m.type === 'sfxGroup' && m.startLineId === line.id);
                                          const char = characters.find(c => c.id === line.characterId);
                                          const nameForCheck = (char?.name || '').replace(/[\[\]()]/g, '').toLowerCase();
                                          const isSfx = nameForCheck === '音效' || nameForCheck === 'sfx';
                                          const display = isSfx ? bracketIfNeeded(line.text) : line.text;
                                          const wrapperClass = '';

                                         return (
                                           <div key={line.id} className={wrapperClass}>
                                                {startingScene && (
                                                  <div
                                                    className="flex items-center gap-x-4 my-4"
                                                    contentEditable={false}
                                                    suppressContentEditableWarning={true}
                                                  >
                                                     <div className="w-24 flex-shrink-0" />
                                                     <div
                                                       className="scene-divider flex-grow cursor-pointer hover:opacity-95"
                                                       title="双击编辑场景"
                                                       onMouseUp={(e) => e.stopPropagation()}
                                                       onDoubleClick={(e) => {
                                                         e.preventDefault();
                                                         e.stopPropagation();
                                                         onOpenEditMarker(startingScene);
                                                       }}
                                                     >
                                                         <span className="scene-divider-text">场景：{startingScene.name}</span>
                                                      </div>
                                                  </div>
                                                )}
                                                {startingSfxGroups.length > 0 && (
                                                  <div className="space-y-2 my-3" contentEditable={false} suppressContentEditableWarning={true}>
                                                    {startingSfxGroups.map((m) => (
                                                      <div key={m.id} className="flex items-center gap-x-4">
                                                        <div className="w-24 flex-shrink-0" />
                                                        <div
                                                          className="sfx-group-divider flex-grow cursor-pointer hover:opacity-95"
                                                          title="双击编辑音效组插入点"
                                                          onMouseUp={(e) => e.stopPropagation()}
                                                          onDoubleClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            onOpenEditMarker(m);
                                                          }}
                                                        >
                                                          <span className="sfx-group-divider-text">音效组：{m.name || '未命名'}</span>
                                                        </div>
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                                <div data-line-id={line.id} className="flex items-start gap-x-4">
                                                    <div className="w-24 pt-1 text-right text-slate-500 select-none flex-shrink-0 font-mono text-xs" contentEditable={false}>{index + 1}</div>
                                                   <HighlightedLine 
                                                       lineId={line.id}
                                                      chapterId={chapter.id}
                                                      text={display} 
                                                      soundLibrary={soundLibrary} 
                                                      soundObservationList={soundObservationList} 
                                                      ignoredKeywords={line.ignoredSoundKeywords}
                                                      onUpdateText={handleLineTextUpdate}
                                                  />
                                              </div>
                                          </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
             {popoverState?.visible && (
                <SoundKeywordPopover
                    keyword={popoverState.keyword}
                    top={popoverState.top}
                    left={popoverState.left}
                    onClose={() => setPopoverState(null)}
                    onMouseEnter={handlePopoverEnter}
                    onMouseLeave={() => setPopoverState(null)}
                    soundLibrary={soundLibrary}
                    pinnedSoundId={currentPinnedSound?.soundId || null}
                    onPinSound={handlePinSfx}
                />
            )}
            {bgmPopoverState?.visible && (
                <BgmPopover
                    keyword={bgmPopoverState.keyword}
                    top={bgmPopoverState.top}
                    left={bgmPopoverState.left}
                    onClose={() => setBgmPopoverState(null)}
                    onMouseEnter={handleBgmPopoverEnter}
                    onMouseLeave={() => setBgmPopoverState(null)}
                    soundLibrary={soundLibrary}
                    pinnedSoundId={currentPinnedBgm?.soundId || null}
                    onPinSound={handlePinBgm}
                />
            )}
            <div className="flex-shrink-0 mt-4">
              <ChapterPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={onPageChange}
                  isAnyOperationLoading={false}
                  isEditingTitle={false}
              />
            </div>
        </div>
    );
};
