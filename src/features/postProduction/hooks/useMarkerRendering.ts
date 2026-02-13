import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { TextMarker, Chapter } from '../../../types';

// Palette definitions (can be moved to a constants file)
const BGM_PALETTE = [
    'hsla(52, 98%, 96%, 0.46)',
    'hsla(332, 98%, 96%, 0.46)',
    'hsla(168, 96%, 95%, 0.46)',
    'hsla(202, 97%, 95%, 0.46)',
    'hsla(265, 96%, 96%, 0.46)',
    'hsla(24,  98%, 95%, 0.46)',
];
const getBgmColor = (ordinal: number): string => BGM_PALETTE[(ordinal - 1) % BGM_PALETTE.length];

export type BgmLabelOverlay = {
    id: string;
    name: string;
    displayNameParts: string[];
    top: number;
    left: number;
    bgColor: string;
    textColor: string;
};


export const useMarkerRendering = (
    textMarkers: TextMarker[],
    chapters: Chapter[],
    suspendLayout?: boolean,
    expandedChapterId?: string | null
) => {
    const contentRef = useRef<HTMLDivElement>(null);
    const lastMarkersRef = useRef<TextMarker[]>([]);
    const [bgmLabelOverlays, setBgmLabelOverlays] = useState<BgmLabelOverlay[]>([]);

    // 从所有文本标记中过滤出类型为 BGM 的标记，用于渲染高亮和左侧标签
    const bgmMarkers = useMemo(
        () => textMarkers.filter((m) => m.type === 'bgm'),
        [textMarkers]
    );

    const lineIdToChapterIndex = useMemo(() => {
        const map = new Map<string, number>();
        chapters.forEach((ch, chIdx) => ch.scriptLines.forEach((ln) => map.set(ln.id, chIdx)));
        return map;
    }, [chapters]);

    const lineIdToLineOrder = useMemo(() => {
        const map = new Map<string, number>();
        chapters.forEach((ch) => ch.scriptLines.forEach((ln, lnIdx) => map.set(ln.id, lnIdx)));
        return map;
    }, [chapters]);

    const markerOrdinalMap = useMemo(() => {
        const map = new Map<string, number>();
        const chapterGrouped: Record<number, { id: string; startOrder: number }[]> = {};
        bgmMarkers.forEach((m) => {
            const chIdx = lineIdToChapterIndex.get(m.startLineId) ?? 0;
            const order = (lineIdToLineOrder.get(m.startLineId) ?? 0) * 1e6 + (m.startOffset ?? 0);
            (chapterGrouped[chIdx] || (chapterGrouped[chIdx] = [])).push({ id: m.id, startOrder: order });
        });
        Object.values(chapterGrouped).forEach(list => list.sort((a, b) => a.startOrder - b.startOrder).forEach((item, idx) => map.set(item.id, idx + 1)));
        return map;
    }, [bgmMarkers, lineIdToChapterIndex, lineIdToLineOrder]);


    const recomputeBgmLabelOverlays = useCallback(() => {
        const contentEl = contentRef.current;
        if (!contentEl || suspendLayout) return;

        const scrollableContainer = contentEl;
        if (!scrollableContainer) return;
        
        const containerRect = scrollableContainer.getBoundingClientRect();
        const newOverlays: BgmLabelOverlay[] = [];

        bgmMarkers.forEach(marker => {
            const markEl = contentEl.querySelector(`mark[data-marker-id="${marker.id}"]`);
            if (markEl) {
                const clientRects = markEl.getClientRects();
                if (clientRects.length > 0) {
                    const firstLineRect = clientRects[0];
                    const top = firstLineRect.top - containerRect.top + scrollableContainer.scrollTop;
                    
                    const baseColor = marker.color || getBgmColor(markerOrdinalMap.get(marker.id) ?? 1);
                    const bgColor = baseColor.replace(/, ?([\d\.]+)\)$/, ', 0.85)');
                    const displayNameParts = (marker.name || 'BGM').replace(/_/g, '-').split('-');
                    
                    newOverlays.push({
                        id: marker.id,
                        name: marker.name || 'BGM',
                        displayNameParts,
                        top: Math.max(0, top),
                        left: 8, // Position in the left gutter
                        bgColor,
                        textColor: '#1e293b'
                    });
                }
            }
        });

        setBgmLabelOverlays(newOverlays);
    }, [bgmMarkers, markerOrdinalMap, suspendLayout]);

    const recalculateBgmHighlights = useCallback(() => {
        const contentEl = contentRef.current;
        if (!contentEl || suspendLayout) return;

        // 调试：观察当前 BGM 标记和高亮计算是否正常触发
        console.log('[BGM] recalculateBgmHighlights', {
            markerCount: bgmMarkers.length,
            markers: bgmMarkers.map((m) => ({
                id: m.id,
                name: m.name,
                startLineId: m.startLineId,
                startOffset: m.startOffset,
                endLineId: m.endLineId,
                endOffset: m.endOffset,
            })),
        });

        // 为避免高亮闪烁，这里暂时不主动清理旧的 bgm-highlight，
        // 而是直接在当前文本结构上追加 / 覆盖高亮区域。

        // 先移除已有的 bgm-highlight，避免删除标记后背景色残留
        contentEl.querySelectorAll('mark.bgm-highlight').forEach((mark) => {
            const parent = mark.parentNode;
            if (parent) {
                while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
                parent.removeChild(mark);
            }
        });
        contentEl.normalize();

        bgmMarkers.forEach((marker) => {
            if (marker.startOffset === undefined || marker.endOffset === undefined) return;
            const lineBlocks = Array.from(contentEl.querySelectorAll('[data-line-id]')) as HTMLElement[];
            const sIdx = lineBlocks.findIndex(el => el.dataset.lineId === marker.startLineId);
            const eIdx = lineBlocks.findIndex(el => el.dataset.lineId === marker.endLineId);
            if (sIdx === -1 || eIdx === -1) {
                console.warn('[BGM] line block not found for marker', marker);
                return;
            }

            // �� DOM �е�紫��起�㡼<♫-name>�� ��ֹ�㡼//����ȷ���߱�����Χ
            const startBlock = lineBlocks[sIdx];
            const endBlock = lineBlocks[eIdx];
            const startParagraph = startBlock.querySelector('p');
            const endParagraph = endBlock.querySelector('p');

            let startAnchorEl: HTMLElement | null = null;
            let endAnchorEl: HTMLElement | null = null;

            if (startParagraph) {
                const candidates = Array.from(
                    startParagraph.querySelectorAll('strong.bgm-marker-inline[data-bgm-name]')
                ) as HTMLElement[];
                const startOffsetStr = marker.startOffset !== undefined ? String(marker.startOffset) : null;
                startAnchorEl =
                    (startOffsetStr ? candidates.find(el => el.dataset.bgmStartOffset === startOffsetStr) : null) ||
                    candidates.find(el => el.dataset.bgmName === (marker.name || '')) ||
                    candidates[0] ||
                    null;
            }

            if (endParagraph) {
                const endCandidates = Array.from(
                    endParagraph.querySelectorAll('strong.bgm-marker-inline[data-bgm-end="1"]')
                ) as HTMLElement[];
                const endOffsetStr = marker.endOffset !== undefined ? String(marker.endOffset) : null;

                endAnchorEl =
                    (endOffsetStr ? endCandidates.find(el => el.dataset.index === endOffsetStr) : null) ||
                    // 回退：找到从起点标记之后出现的第一个结束标记（用于同一行多个 // 或缺少 data-index 的历史渲染）
                    (() => {
                        if (!startAnchorEl) return null;
                        const allEnds = Array.from(
                            contentEl.querySelectorAll('strong.bgm-marker-inline[data-bgm-end="1"]')
                        ) as HTMLElement[];
                        for (const el of allEnds) {
                            if (startAnchorEl.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) return el;
                        }
                        return null;
                    })() ||
                    endCandidates[0] ||
                    null;
            }

            const canUseDomAnchors =
                !!startAnchorEl &&
                !!endAnchorEl &&
                !(startAnchorEl.compareDocumentPosition(endAnchorEl) & Node.DOCUMENT_POSITION_PRECEDING);

            const findNode = (p: Element, offset: number) => {
              const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
              let accumulated = 0;
              let node;
              while (node = walker.nextNode()) {
                const len = node.textContent?.length || 0;
                if (accumulated + len >= offset) return { node, offset: offset - accumulated };
                accumulated += len;
              }
              return { node: p.lastChild || p, offset: (p.lastChild as Text)?.length || 0 };
            };

            for (let i = sIdx; i <= eIdx; i++) {
                const p = lineBlocks[i].querySelector('p');
                if (!p || !p.firstChild) continue;
                try {
                    const range = document.createRange();

                    if (canUseDomAnchors) {
                        // 使用 DOM 锚点：起点在 <♫-name> 之后，终点在 // 之前
                        if (i === sIdx && startAnchorEl) {
                            range.setStartAfter(startAnchorEl);
                        } else {
                            range.setStart(p.firstChild, 0);
                        }

                        if (i === eIdx && endAnchorEl) {
                            range.setEndBefore(endAnchorEl);
                        } else {
                            range.setEndAfter(p.lastChild);
                        }
                    } else if (marker.startOffset !== undefined && marker.endOffset !== undefined) {
                        // 回退：仍然支持旧的基于 offset 的高亮（兼容历史数据）
                        if (i === sIdx) {
                            const start = findNode(p, marker.startOffset);
                            range.setStart(start.node, start.offset);
                        } else {
                            range.setStart(p.firstChild, 0);
                        }
                        if (i === eIdx) {
                            const end = findNode(p, marker.endOffset);
                            range.setEnd(end.node, end.offset);
                        } else {
                            range.setEndAfter(p.lastChild);
                        }
                    } else {
                        continue;
                    }

                    const mark = document.createElement('mark');
                    mark.className = 'bgm-highlight';
                    mark.dataset.markerId = marker.id;
                    // 使用与旧版 music-range-highlight 相近的黄色背景，并强制黑色文字，保证可读性
                    mark.style.backgroundColor = '#FFF9C4';
                    mark.style.color = '#000000';
                    mark.style.borderRadius = '3px';
                    mark.title = marker.name || 'BGM';
                    range.surroundContents(mark);
                    console.log('[BGM] applied highlight', {
                        markerId: marker.id,
                        lineIndex: i,
                        startOffset: marker.startOffset,
                        endOffset: marker.endOffset,
                    });
                } catch (e) {
                    console.error('BGM highlight error:', e);
                }
            }
        });

    }, [bgmMarkers, suspendLayout, markerOrdinalMap]);

    useEffect(() => {
        if (!suspendLayout) {
            // A timeout gives React time to render the newly expanded content
            setTimeout(() => {
                recalculateBgmHighlights();
                // 不再绘制左侧彩色 BGM 头部条，只保留文本内部的高亮 <...>//。
                setBgmLabelOverlays([]);
            }, 50);
        }
        lastMarkersRef.current = textMarkers;
    }, [textMarkers, suspendLayout, recalculateBgmHighlights, expandedChapterId]);
    
    // 仍然保留 contentRef 的滚动监听用于其它用途，但不再更新 bgmLabelOverlays。
    useEffect(() => {
        if (suspendLayout) return;
        
        const scrollableParent = contentRef.current;
        if (!scrollableParent) return;

        let timeoutId: number;
        const handle = () => {
          clearTimeout(timeoutId);
          timeoutId = window.setTimeout(() => {
            // no-op for bgmLabelOverlays
          }, 120);
        };

        window.addEventListener('resize', handle);
        scrollableParent.addEventListener('scroll', handle);

        return () => {
          window.removeEventListener('resize', handle);
          scrollableParent.removeEventListener('scroll', handle);
          clearTimeout(timeoutId);
        };
    }, [suspendLayout]);


    return {
        contentRef,
        bgmLabelOverlays,
    };
};
