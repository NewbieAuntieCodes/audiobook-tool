import { ArrowLeftIcon, ArrowPathIcon, CloudArrowDownIcon } from '../../components/ui/icons';
import { useStore } from '../../store/useStore';
import CuePointWriterPanel from './components/CuePointWriterPanel';
import M4aConverterPanel from './components/M4aConverterPanel';
import MarkerTransferPanel from './components/MarkerTransferPanel';
import TranscriptCleanerPanel from './components/TranscriptCleanerPanel';

const ToolsPage = () => {
  const { navigateTo } = useStore((state) => ({ navigateTo: state.navigateTo }));

  return (
    <div className="h-full w-full flex flex-col bg-slate-900 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-850/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateTo('editor')}
            className="flex items-center px-3 py-1.5 text-sm rounded-md bg-slate-800 text-slate-200 border border-slate-700 hover:border-sky-500 hover:text-sky-100 transition"
            title="返回项目编辑"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-1" />
            返回编辑
          </button>
          <div>
            <h1 className="text-2xl font-bold text-sky-400">辅助工具</h1>
            <p className="text-sm text-slate-400">
              为工作流提供批量、小工具支持，页面只负责组合，具体工具各自独立维护。
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 border border-slate-700">
            <CloudArrowDownIcon className="w-4 h-4 text-sky-300" />
            <span>依赖本地 Audition 标记</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 border border-slate-700">
            <ArrowPathIcon className="w-4 h-4 text-emerald-300" />
            <span>跨音频批量迁移</span>
          </div>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto p-6 space-y-5">
        <TranscriptCleanerPanel />
        <M4aConverterPanel />
        <CuePointWriterPanel />
        <MarkerTransferPanel />
      </div>
    </div>
  );
};

export default ToolsPage;
