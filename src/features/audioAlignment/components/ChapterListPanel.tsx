import React from 'react';
import { Chapter } from '../../../types';
import ChapterPagination from '../../scriptEditor/components/chapter_list_panel/ChapterPagination';

interface ChapterListPanelProps {
    currentProjectChapters: Chapter[];
    paginatedChapters: Chapter[];
    multiSelectedChapterIds: string[];
    selectedChapterId: string | null;
    handleToggleMultiSelect: (chapterId: string, event: React.MouseEvent) => void;
    setSelectedChapterId: (id: string) => void;
    currentPage: number;
    totalPages: number;
    handlePageChange: (page: number) => void;
    allVisibleChaptersSelected: boolean;
    handleToggleSelectAllOnPage: () => void;
}

const formatChapterNumber = (index: number) => {
    if (index < 0) return '';
    const number = index + 1;
    return number < 1000 ? String(number).padStart(3, '0') : String(number);
};

const ChapterListPanel: React.FC<ChapterListPanelProps> = ({
    currentProjectChapters,
    paginatedChapters,
    multiSelectedChapterIds,
    selectedChapterId,
    handleToggleMultiSelect,
    setSelectedChapterId,
    currentPage,
    totalPages,
    handlePageChange,
    allVisibleChaptersSelected,
    handleToggleSelectAllOnPage,
}) => {
  return (
    <div className="p-3 h-full flex flex-col bg-slate-800 text-slate-100">
      <h2 className="text-lg font-semibold text-slate-300 mb-3">章节列表 ({currentProjectChapters.length})</h2>

      <div className="flex items-center space-x-2 mb-2 pb-2 border-b border-slate-700">
        <input
          type="checkbox"
          id="select-all-on-page"
          checked={allVisibleChaptersSelected}
          onChange={handleToggleSelectAllOnPage}
          disabled={paginatedChapters.length === 0}
          className="form-checkbox h-4 w-4 text-sky-500 bg-slate-700 border-slate-600 rounded focus:ring-sky-400 cursor-pointer disabled:opacity-50"
        />
        <label htmlFor="select-all-on-page" className="text-sm text-slate-300 select-none cursor-pointer">
          全选当前页 ({multiSelectedChapterIds.length} / {currentProjectChapters.length})
        </label>
      </div>

      <div className="flex-grow overflow-y-auto space-y-1 pr-1 -mr-1">
          {paginatedChapters.map(chapter => {
              const chapterIndex = currentProjectChapters.findIndex(c => c.id === chapter.id);
              const displayTitle = `${formatChapterNumber(chapterIndex)} ${chapter.title}`;
              const isMultiSelected = multiSelectedChapterIds.includes(chapter.id);
              return (
                <li key={chapter.id} className="list-none flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={isMultiSelected}
                      onClick={(e) => handleToggleMultiSelect(chapter.id, e)}
                      className="form-checkbox h-4 w-4 text-sky-500 bg-slate-700 border-slate-600 rounded focus:ring-sky-400 cursor-pointer flex-shrink-0"
                      aria-label={`选择章节 ${displayTitle}`}
                    />
                    <button
                        onClick={() => setSelectedChapterId(chapter.id)}
                        className={`flex-grow text-left px-3 py-2 rounded-md text-sm transition-colors ${
                            selectedChapterId === chapter.id
                            ? 'bg-sky-600 text-white font-semibold'
                            : isMultiSelected
                            ? 'bg-sky-800 text-sky-100'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                        }`}
                    >
                       {displayTitle}
                    </button>
                </li>
          )})}
      </div>

      <ChapterPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          isAnyOperationLoading={false}
          isEditingTitle={false}
      />
    </div>
  );
};

export default ChapterListPanel;
