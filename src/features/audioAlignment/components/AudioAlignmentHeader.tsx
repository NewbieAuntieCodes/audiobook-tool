import React, { useRef } from 'react';
import {
  ChevronLeftIcon,
  UserCircleIcon,
  ListBulletIcon,
  ArrowDownTrayIcon,
  SpeakerXMarkIcon,
  CogIcon,
  MicrophoneIcon,
  SparklesIcon,
  CheckCircleIcon,
  XMarkIcon,
  ArrowDownOnSquareIcon,
  ReturnIcon,
} from '../../../components/ui/icons';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import { Character } from '../../../types';
import { WebSocketStatus, LufsSettings } from '../../../store/slices/uiSlice';
import NumberInput from '../../../components/ui/NumberInput';
import Switch from '../../../components/ui/Switch';

interface AudioAlignmentHeaderProps {
  currentProjectName: string;
  webSocketStatus: WebSocketStatus;
  pronunciationNoteCount: number;
  onOpenPronunciationNotes: () => void;
  isRecordingMode: boolean;
  onToggleRecordingMode: () => void;
  cvFilter: string;
  onCvFilterChange: (value: string) => void;
  characterFilter: string;
  onCharacterFilterChange: (value: string) => void;
  projectCharacters: Character[];
  projectCvNames: string[];
  onOpenSilenceSettings: () => void;
  lufsSettings: LufsSettings;
  onLufsSettingsChange: (settings: Partial<LufsSettings>) => void;
  isSmartMatchLoading: boolean;
  isChapterMatchLoading: boolean;
  isAsrAlignLoading: boolean;
  onOpenExportModal: () => void;
  isExporting: boolean;
  isExportingToReaper: boolean;
  reaperExportAudioFormat: 'wav' | 'mp3';
  onReaperExportAudioFormatChange: (format: 'wav' | 'mp3') => void;
  onExportToReaper: () => void;
  onClearAudio: () => void;
  hasAudioInSelection: boolean;
  multiSelectCount: number;
  onGoBack: () => void;
  onFileSelectionForSmartMatch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileSelectionForChapterMatch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileSelectionForAsrAlign: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isReturnMatchLoading: boolean;
  onFileSelectionForReturnMatch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onReconnect: () => void;
}

const StatusIndicator: React.FC<{ status: WebSocketStatus; onReconnect: () => void }> = ({ status, onReconnect }) => {
  switch (status) {
    case 'connected':
      return <span className="flex items-center text-xs text-green-400"><CheckCircleIcon className="w-4 h-4 mr-1"/>热键服务已连接</span>;
    case 'connecting':
      return <span className="flex items-center text-xs text-yellow-400"><LoadingSpinner/>连接中...</span>;
    case 'disconnected':
    default:
      return (
        <span className="flex items-center text-xs text-red-400 gap-2">
          <span className="flex items-center"><XMarkIcon className="w-4 h-4 mr-1"/>热键服务未连接</span>
          <button
            onClick={onReconnect}
            disabled={status === 'connecting'}
            className="text-[11px] px-2 py-1 rounded bg-slate-800 text-sky-300 hover:text-sky-100 hover:bg-slate-700 border border-slate-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="尝试连接热键服务"
          >
            尝试连接
          </button>
        </span>
      );
  }
};

const AudioAlignmentHeader: React.FC<AudioAlignmentHeaderProps> = ({
  currentProjectName,
  webSocketStatus,
  pronunciationNoteCount,
  onOpenPronunciationNotes,
  isRecordingMode,
  onToggleRecordingMode,
  cvFilter,
  onCvFilterChange,
  characterFilter,
  onCharacterFilterChange,
  projectCharacters,
  projectCvNames,
  onOpenSilenceSettings,
  lufsSettings,
  onLufsSettingsChange,
  isSmartMatchLoading,
  isChapterMatchLoading,
  isAsrAlignLoading,
  onOpenExportModal,
  isExporting,
  isExportingToReaper,
  reaperExportAudioFormat,
  onReaperExportAudioFormatChange,
  onExportToReaper,
  onClearAudio,
  hasAudioInSelection,
  multiSelectCount,
  onGoBack,
  onFileSelectionForSmartMatch,
  onFileSelectionForChapterMatch,
  onFileSelectionForAsrAlign,
  isReturnMatchLoading,
  onFileSelectionForReturnMatch,
  onReconnect,
}) => {
    const chapterMatchFileInputRef = useRef<HTMLInputElement>(null);
    const smartMatchFileInputRef = useRef<HTMLInputElement>(null);
    const asrAlignFileInputRef = useRef<HTMLInputElement>(null);
    const returnMatchFileInputRef = useRef<HTMLInputElement>(null);

    const handleChapterMatchClick = () => chapterMatchFileInputRef.current?.click();
    const handleSmartMatchClick = () => smartMatchFileInputRef.current?.click();
    const handleAsrAlignClick = () => asrAlignFileInputRef.current?.click();
    const handleReturnMatchClick = () => returnMatchFileInputRef.current?.click();

  return (
    <header className="flex items-center justify-between p-4 border-b border-slate-800 flex-shrink-0 flex-wrap gap-2">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold text-sky-400 truncate pr-4">
          音频对轨: <span className="text-slate-200">{currentProjectName}</span>
        </h1>
        <StatusIndicator status={webSocketStatus} onReconnect={onReconnect} />
      </div>
      <div className="flex items-center space-x-2 flex-wrap justify-end gap-2">
          <input
              type="file"
              multiple
              accept="audio/*"
              ref={chapterMatchFileInputRef}
              onChange={onFileSelectionForChapterMatch}
              className="hidden"
          />
          <input
              type="file"
              multiple
              accept="audio/*"
              ref={smartMatchFileInputRef}
              onChange={onFileSelectionForSmartMatch}
              className="hidden"
          />
          <input
              type="file"
              accept="audio/*,.docx,.txt"
              ref={asrAlignFileInputRef}
              onChange={onFileSelectionForAsrAlign}
              className="hidden"
          />
          <input
              type="file"
              accept="audio/*"
              ref={returnMatchFileInputRef}
              onChange={onFileSelectionForReturnMatch}
              className="hidden"
          />
          <button
              onClick={onToggleRecordingMode}
              className={`flex items-center text-sm px-3 py-1.5 rounded-md transition-colors ${
                  isRecordingMode
                  ? 'bg-red-600 text-white hover:bg-red-700 ring-2 ring-red-300'
                  : 'text-red-300 hover:text-red-100 bg-slate-700 hover:bg-slate-600'
              }`}
              aria-pressed={isRecordingMode}
              title="切换录制模式"
          >
              <MicrophoneIcon className="w-4 h-4 mr-1.5" />
              录制模式
          </button>
          {isRecordingMode && (
              <>
                  <div className="flex items-center bg-slate-700 rounded-md">
                      <label htmlFor="cv-filter" className="text-sm text-slate-400 pl-3 pr-2 whitespace-nowrap">CV:</label>
                      <select
                          id="cv-filter"
                          value={cvFilter}
                          onChange={(e) => onCvFilterChange(e.target.value)}
                          className="bg-slate-700 border-l border-slate-600 text-white text-sm rounded-r-md focus:ring-sky-500 focus:border-sky-500 p-1.5 max-w-[120px]"
                      >
                          <option value="">所有CV</option>
                          {projectCvNames.map(cv => <option key={cv} value={cv}>{cv}</option>)}
                      </select>
                  </div>
                  <div className="flex items-center bg-slate-700 rounded-md">
                      <label htmlFor="char-filter" className="text-sm text-slate-400 pl-3 pr-2 whitespace-nowrap">角色:</label>
                      <select
                          id="char-filter"
                          value={characterFilter}
                          onChange={(e) => onCharacterFilterChange(e.target.value)}
                          className="bg-slate-700 border-l border-slate-600 text-white text-sm rounded-r-md focus:ring-sky-500 focus:border-sky-500 p-1.5 max-w-[120px]"
                      >
                          <option value="">所有角色</option>
                          {projectCharacters
                              .filter(c => c.name !== '[静音]' && c.name !== '音效' && c.name !== '[音效]' && c.name !== 'Narrator')
                              .sort((a,b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
                              .map(char => <option key={char.id} value={char.id}>{char.name}</option>)}
                      </select>
                  </div>
              </>
          )}
          <button
              onClick={onOpenSilenceSettings}
              className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md"
              aria-label="间隔配置"
          >
              <CogIcon className="w-4 h-4 mr-1" />
              间隔配置
          </button>
          <button
              onClick={onOpenPronunciationNotes}
              className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md"
              aria-label="拼音备注"
              title={`本书拼音备注（常显）：${pronunciationNoteCount} 条`}
          >
              <MicrophoneIcon className="w-4 h-4 mr-1" />
              拼音备注
              <span className="ml-2 text-xs text-slate-300">{pronunciationNoteCount}</span>
          </button>
          <div className="flex items-center gap-x-2 bg-slate-700 rounded-md p-1 h-8" title="LUFS 响度标准化">
            <span className="text-sm text-slate-400 pl-1.5 pr-1 font-sans font-semibold">LUFS</span>
            <NumberInput
                value={lufsSettings.target}
                onChange={target => onLufsSettingsChange({ target })}
                step={0.5}
                min={-40}
                max={0}
                precision={1}
            />
            <Switch
                checked={lufsSettings.enabled}
                onChange={enabled => onLufsSettingsChange({ enabled })}
                label={lufsSettings.enabled ? "响度标准化已激活" : "响度标准化未激活"}
            />
          </div>
          <button
              onClick={handleSmartMatchClick}
              disabled={isSmartMatchLoading}
              className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50"
              aria-label="按CV/角色匹配批量上传"
              title="智能匹配CV名或角色名"
          >
              {isSmartMatchLoading ? <LoadingSpinner /> : <UserCircleIcon className="w-4 h-4 mr-1" />}
              {isSmartMatchLoading ? '匹配中...' : '按CV/角色匹配'}
          </button>
          <button
              onClick={handleChapterMatchClick}
              disabled={isChapterMatchLoading}
              className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50"
              aria-label="按章节匹配批量上传"
          >
              {isChapterMatchLoading ? <LoadingSpinner /> : <ListBulletIcon className="w-4 h-4 mr-1" />}
              {isChapterMatchLoading ? '匹配中...' : '按章节匹配'}
          </button>
          <button
              onClick={handleAsrAlignClick}
              disabled={isAsrAlignLoading}
              className="flex items-center text-sm text-violet-300 hover:text-violet-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50"
              aria-label="AI辅助对轨"
              title="当前章节单音频：优先使用 faster-whisper GPU 生成时间戳，再匹配脚本。也可同时选择音频和带时间戳 .docx/.txt。"
          >
              {isAsrAlignLoading ? <LoadingSpinner /> : <SparklesIcon className="w-4 h-4 mr-1" />}
              {isAsrAlignLoading ? 'AI对轨中...' : 'AI辅助对轨'}
          </button>
          <button
              onClick={handleReturnMatchClick}
              disabled={isReturnMatchLoading}
              className="flex items-center text-sm text-amber-300 hover:text-amber-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50"
              aria-label="按返音匹配批量上传"
              title="根据返音标记和所选章节范围，匹配并替换音频"
          >
              {isReturnMatchLoading ? <LoadingSpinner /> : <ReturnIcon className="w-4 h-4 mr-1" />}
              {isReturnMatchLoading ? '匹配中...' : '按返音匹配'}
          </button>
          <button
              onClick={onOpenExportModal}
              disabled={isExporting}
              className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50"
              aria-label="导出音频"
          >
              {isExporting ? <LoadingSpinner /> : <ArrowDownTrayIcon className="w-4 h-4 mr-1" />}
              {isExporting ? '导出中...' : '导出音频'}
          </button>
          <select
            value={reaperExportAudioFormat}
            onChange={(e) => onReaperExportAudioFormatChange(e.target.value as 'wav' | 'mp3')}
            className="h-8 px-2 text-sm bg-slate-700 text-slate-100 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500"
            title={reaperExportAudioFormat === 'mp3' ? 'MP3 文件更小，但有损压缩；极少数情况下可能出现微小对齐差异' : 'WAV 文件更大，但最利于精准对齐与后期处理'}
            aria-label="Reaper 导出素材格式"
          >
            <option value="mp3">MP3 (192kbps)</option>
            <option value="wav">WAV</option>
          </select>
          <button
            onClick={onExportToReaper}
            disabled={isExportingToReaper}
            className="flex items-center text-sm text-teal-300 hover:text-teal-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50"
            aria-label="导出到 Reaper"
            title="将选中的章节导出为 Reaper 工程文件"
          >
            {isExportingToReaper ? <LoadingSpinner /> : <ArrowDownOnSquareIcon className="w-4 h-4 mr-1" />}
            {isExportingToReaper ? '导出中...' : '导出到 Reaper'}
          </button>
          <button
              onClick={onClearAudio}
              disabled={!hasAudioInSelection || isExporting}
              className="flex items-center text-sm text-red-400 hover:text-red-300 px-3 py-1.5 bg-red-900/50 hover:bg-red-800/50 rounded-md disabled:opacity-50"
              aria-label="清除本章所有音频"
          >
              <SpeakerXMarkIcon className="w-4 h-4 mr-1" />
              {multiSelectCount > 1 ? `清除所选音频 (${multiSelectCount})` : '清除本章音频'}
          </button>
          <button
              onClick={onGoBack}
              className="flex items-center text-sm text-sky-300 hover:text-sky-100 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md"
              aria-label="Back"
          >
            <ChevronLeftIcon className="w-4 h-4 mr-1" /> 返回
          </button>
      </div>
    </header>
  );
};

export default AudioAlignmentHeader;
