import type { ReactNode } from 'react';
import { WrenchIcon } from '../../../components/ui/icons';

interface ToolSectionProps {
  title: string;
  description: string;
  iconClassName: string;
  actions?: ReactNode;
  children: ReactNode;
}

const ToolSection = ({
  title,
  description,
  iconClassName,
  actions,
  children,
}: ToolSectionProps) => {
  return (
    <section className="bg-slate-850 border border-slate-800 rounded-2xl p-5 shadow-lg shadow-slate-900/30">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div
            className={`w-9 h-9 rounded-full border flex items-center justify-center ${iconClassName}`}
          >
            <WrenchIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-semibold text-slate-50">{title}</div>
            <div className="text-sm text-slate-400">{description}</div>
          </div>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
};

export default ToolSection;
