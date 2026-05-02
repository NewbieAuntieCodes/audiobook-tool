import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { ApiSettings, AiProvider } from '../../store/slices/uiSlice';
import { XMarkIcon } from '../ui/icons';

const providers: { key: AiProvider; name: string }[] = [
    { key: 'gemini', name: 'Gemini' },
    { key: 'openai', name: 'GPT' },
    { key: 'moonshot', name: 'Moonshot' },
    { key: 'deepseek', name: 'DeepSeek' },
    { key: 'codex', name: 'Codex' },
];

const recommendedDeepSeekSettings: Pick<ApiSettings['deepseek'], 'baseUrl' | 'model'> = {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
};

const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { apiSettings: initialApiSettings, setApiSettings } = useStore();
    const [settings, setSettings] = useState<ApiSettings>(initialApiSettings);
    const [activeTab, setActiveTab] = useState<AiProvider>('gemini');

    useEffect(() => {
        if (isOpen) {
            setSettings(initialApiSettings);
        }
    }, [isOpen, initialApiSettings]);

    if (!isOpen) return null;

    const handleSave = () => {
        setApiSettings(settings);
        onClose();
    };

    // FIX: The original `handleChange` had a typing issue where `field: keyof ApiSettings[AiProvider]`
    // resolved to an intersection of keys ('apiKey' | 'baseUrl'), causing an error when 'model' was passed.
    // Making the function generic ensures `field` is correctly typed against the specific provider's settings.
    const handleChange = <P extends AiProvider>(provider: P, field: keyof ApiSettings[P], value: string) => {
        setSettings(prev => ({
            ...prev,
            [provider]: {
                ...prev[provider],
                [field]: value,
            },
        }));
    };

    const applyRecommendedDeepSeekSettings = () => {
        setSettings(prev => ({
            ...prev,
            deepseek: {
                ...prev.deepseek,
                ...recommendedDeepSeekSettings,
            },
        }));
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[100] p-4" onClick={onClose}>
            <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-2xl border border-slate-700 flex flex-col h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-xl font-semibold text-slate-100">设置</h2>
                    <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-white"><XMarkIcon /></button>
                </div>

                <div className="flex-grow flex gap-6 overflow-hidden">
                    <div className="w-1/4 border-r border-slate-700 pr-4">
                        <nav className="flex flex-col space-y-1">
                            {providers.map(p => (
                                <button
                                    key={p.key}
                                    onClick={() => setActiveTab(p.key)}
                                    className={`w-full text-left px-3 py-2 text-sm rounded-md border transition-colors ${
                                        activeTab === p.key
                                            ? 'border-sky-500 bg-sky-600 text-white shadow-sm'
                                            : 'border-slate-600 bg-slate-800 text-slate-100 hover:border-sky-500/70 hover:bg-slate-700 hover:text-white'
                                    }`}
                                >
                                    {p.name}
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className="w-3/4 overflow-y-auto pr-2">
                        {activeTab === 'gemini' && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-medium text-sky-400">Gemini Settings</h3>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">API Key</label>
                                    <input
                                        type="password"
                                        value={settings.gemini.apiKey}
                                        onChange={e => handleChange('gemini', 'apiKey', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                            </div>
                        )}
                        {activeTab === 'openai' && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-medium text-sky-400">OpenAI (GPT) Settings</h3>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">API Key</label>
                                    <input
                                        type="password"
                                        value={settings.openai.apiKey}
                                        onChange={e => handleChange('openai', 'apiKey', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Base URL (Optional)</label>
                                    <input
                                        type="text"
                                        value={settings.openai.baseUrl}
                                        onChange={e => handleChange('openai', 'baseUrl', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Model</label>
                                    <input
                                        type="text"
                                        value={settings.openai.model}
                                        onChange={e => handleChange('openai', 'model', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                            </div>
                        )}
                         {activeTab === 'moonshot' && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-medium text-sky-400">Moonshot (Kimi) Settings</h3>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">API Key</label>
                                    <input
                                        type="password"
                                        value={settings.moonshot.apiKey}
                                        onChange={e => handleChange('moonshot', 'apiKey', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Base URL (Optional)</label>
                                    <input
                                        type="text"
                                        value={settings.moonshot.baseUrl}
                                        onChange={e => handleChange('moonshot', 'baseUrl', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Model</label>
                                    <input
                                        type="text"
                                        value={settings.moonshot.model}
                                        onChange={e => handleChange('moonshot', 'model', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                            </div>
                        )}
                        {activeTab === 'deepseek' && (
                            <div className="space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-lg font-medium text-sky-400">DeepSeek 设置</h3>
                                        <p className="mt-1 text-sm leading-6 text-slate-400">
                                            用于“导入 AI 辅助标注文本”里的 DeepSeek 快速/精细按钮。
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={applyRecommendedDeepSeekSettings}
                                        className="shrink-0 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
                                    >
                                        填入推荐值
                                    </button>
                                </div>
                                <div className="rounded-md border border-sky-500/30 bg-slate-900/70 p-3 text-sm leading-6 text-slate-300">
                                    <div>快速按钮：使用下方 Model，推荐 deepseek-v4-flash。</div>
                                    <div>精细按钮：会自动使用 deepseek-v4-pro，不需要在这里手动切换。</div>
                                    <div>Base URL 推荐 https://api.deepseek.com；保留 /v1 也能兼容。</div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">API Key</label>
                                    <input
                                        type="password"
                                        value={settings.deepseek.apiKey}
                                        onChange={e => handleChange('deepseek', 'apiKey', e.target.value)}
                                        placeholder="sk-..."
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Base URL</label>
                                    <input
                                        type="text"
                                        value={settings.deepseek.baseUrl}
                                        onChange={e => handleChange('deepseek', 'baseUrl', e.target.value)}
                                        placeholder="https://api.deepseek.com"
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">快速模式 Model</label>
                                    <select
                                        value={settings.deepseek.model}
                                        onChange={e => handleChange('deepseek', 'model', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    >
                                        <option value="deepseek-v4-flash">deepseek-v4-flash（推荐，快速/便宜）</option>
                                        <option value="deepseek-v4-pro">deepseek-v4-pro（更稳但更贵）</option>
                                        <option value="deepseek-chat">deepseek-chat（旧名称，会自动按快速模式处理）</option>
                                    </select>
                                    <p className="mt-1 text-xs leading-5 text-slate-400">
                                        这个选项只影响“DeepSeek 快速”。“DeepSeek 精细”会强制走 deepseek-v4-pro。
                                    </p>
                                </div>
                            </div>
                        )}
                        {activeTab === 'codex' && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-medium text-sky-400">Codex Settings</h3>
                                <p className="text-sm text-slate-400">
                                    用于“画本步骤2”里直接调用 Responses API 做角色标注。
                                </p>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">API Key</label>
                                    <input
                                        type="password"
                                        value={settings.codex.apiKey}
                                        onChange={e => handleChange('codex', 'apiKey', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Base URL</label>
                                    <input
                                        type="text"
                                        value={settings.codex.baseUrl}
                                        onChange={e => handleChange('codex', 'baseUrl', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                        placeholder="https://your-endpoint/v1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Model</label>
                                    <input
                                        type="text"
                                        value={settings.codex.model}
                                        onChange={e => handleChange('codex', 'model', e.target.value)}
                                        className="w-full p-2 bg-slate-700 text-slate-100 rounded-md border border-slate-600"
                                        placeholder="gpt-5.4"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6 flex-shrink-0">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-md">
                        取消
                    </button>
                    <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md">
                        保存
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
