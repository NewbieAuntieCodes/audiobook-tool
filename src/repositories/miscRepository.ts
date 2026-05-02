/**
 * 杂项数据操作层 (Misc Repository)
 *
 * 职责：
 * - 统一管理键值对存储（misc表）
 * - 处理应用配置、预设、历史记录等
 * - 提供类型安全的读写方法
 */

import { db, MiscData } from '../db';
import { MergeHistoryEntry, PresetColor, AudioAssistantState, DirectoryHandleEntry } from '../types';
// FIX: The ApiSettings interface was outdated. Imported the correct, comprehensive interface from uiSlice to ensure type consistency for API settings across the app.
import {
  type ApiSettings,
  type LocalCodexSettings,
  defaultLocalCodexSettings,
  normalizeLocalCodexSettings,
} from '../store/slices/uiSlice';
export type { ApiSettings };


/**
 * 字符快捷键映射类型
 */
export type CharacterShortcuts = Record<string, string>; // Key: shortcut, Value: characterId

/**
 * 杂项数据仓库
 */
export class MiscRepository {
  /**
   * 获取原始键值数据
   */
  private async getRaw<T = any>(key: string): Promise<T | undefined> {
    try {
      const item = await db.misc.get(key);
      return item?.value as T | undefined;
    } catch (error) {
      console.error(`❌ [MiscRepository] 获取数据失败 (${key}):`, error);
      return undefined;
    }
  }

  /**
   * 设置键值数据
   */
  private async setRaw<T = any>(key: string, value: T): Promise<void> {
    try {
      await db.misc.put({ key, value });
      console.log(`✅ [MiscRepository] 保存数据成功: ${key}`);
    } catch (error) {
      console.error(`❌ [MiscRepository] 保存数据失败 (${key}):`, error);
      throw new Error(`保存数据失败: ${key}`);
    }
  }

  /**
   * 删除键值数据
   */
  private async deleteRaw(key: string): Promise<void> {
    try {
      await db.misc.delete(key);
      console.log(`✅ [MiscRepository] 删除数据成功: ${key}`);
    } catch (error) {
      console.error(`❌ [MiscRepository] 删除数据失败 (${key}):`, error);
      throw new Error(`删除数据失败: ${key}`);
    }
  }

  // ==================== 音效助手 ====================
  
  /**
   * 获取音效关键词观察列表
   */
  async getSoundObservationList(): Promise<string[]> {
      const list = await this.getRaw<string[]>('soundObservationList');
      return list || [];
  }

  /**
   * 保存音效关键词观察列表
   */
  async saveSoundObservationList(list: string[]): Promise<void> {
      await this.setRaw('soundObservationList', list);
  }

  /**
   * 获取音效关键词（按分类）
   * key 通常为音效库分类（例如 footsteps / doors_windows 等），也可包含通用分类（如 "__global__"）。
   */
  async getSoundObservationByCategory(): Promise<Record<string, string[]>> {
      const map = await this.getRaw<Record<string, string[]>>('soundObservationByCategory');
      return map || {};
  }

  /**
   * 保存音效关键词（按分类）
   */
  async saveSoundObservationByCategory(map: Record<string, string[]>): Promise<void> {
      await this.setRaw('soundObservationByCategory', map);
  }

  // ==================== 合并历史 ====================

  /**
   * 获取合并历史
   */
  async getMergeHistory(): Promise<MergeHistoryEntry[]> {
    const history = await this.getRaw<MergeHistoryEntry[]>('mergeHistory');
    return history || [];
  }

  /**
   * 保存合并历史
   */
  async saveMergeHistory(history: MergeHistoryEntry[]): Promise<void> {
    await this.setRaw('mergeHistory', history);
  }

  /**
   * 添加合并历史条目
   */
  async addMergeHistoryEntry(entry: MergeHistoryEntry): Promise<void> {
    const history = await this.getMergeHistory();
    history.push(entry);
    await this.saveMergeHistory(history);
  }

  // ==================== 颜色预设 ====================

  /**
   * 获取CV颜色预设
   */
  async getCvColorPresets(): Promise<PresetColor[]> {
    return await this.getRaw<PresetColor[]>('cvColorPresets') || [];
  }

  /**
   * 保存CV颜色预设
   */
  async saveCvColorPresets(presets: PresetColor[]): Promise<void> {
    await this.setRaw('cvColorPresets', presets);
  }

  /**
   * 获取角色颜色预设
   */
  async getCharacterColorPresets(): Promise<PresetColor[]> {
    return await this.getRaw<PresetColor[]>('characterColorPresets') || [];
  }

  /**
   * 保存角色颜色预设
   */
  async saveCharacterColorPresets(presets: PresetColor[]): Promise<void> {
    await this.setRaw('characterColorPresets', presets);
  }

  // ==================== API 设置 ====================

  /**
   * 获取API设置
   */
  async getApiSettings(): Promise<ApiSettings> {
    const settings = await this.getRaw<ApiSettings>('apiSettings');
    return settings || {
        gemini: { apiKey: '' },
        openai: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4-turbo' },
        moonshot: { apiKey: '', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
        deepseek: { apiKey: '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
        codex: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.4' },
    };
  }

  /**
   * 保存API设置
   */
  async saveApiSettings(settings: ApiSettings): Promise<void> {
    await this.setRaw('apiSettings', settings);
  }

  /**
   * 获取本地 Codex 画本配置
   */
  async getLocalCodexSettings(): Promise<LocalCodexSettings> {
    const settings = await this.getRaw<LocalCodexSettings>('localCodexSettings');
    return settings ? normalizeLocalCodexSettings(settings) : defaultLocalCodexSettings;
  }

  /**
   * 保存本地 Codex 画本配置
   */
  async saveLocalCodexSettings(settings: LocalCodexSettings): Promise<void> {
    await this.setRaw('localCodexSettings', normalizeLocalCodexSettings(settings));
  }

  /**
   * 获取选中的AI提供商
   */
  async getSelectedAiProvider(): Promise<string> {
    const provider = await this.getRaw<string>('selectedAiProvider');
    return provider || 'gemini';
  }

  /**
   * 保存选中的AI提供商
   */
  async saveSelectedAiProvider(provider: string): Promise<void> {
    await this.setRaw('selectedAiProvider', provider);
  }

  // ==================== 字符快捷键 ====================

  /**
   * 获取字符快捷键映射
   */
  async getCharacterShortcuts(): Promise<CharacterShortcuts> {
    const shortcuts = await this.getRaw<CharacterShortcuts>('characterShortcuts');
    return shortcuts || {};
  }

  /**
   * 保存字符快捷键映射
   */
  async saveCharacterShortcuts(shortcuts: CharacterShortcuts): Promise<void> {
    await this.setRaw('characterShortcuts', shortcuts);
  }

  // ==================== 音频助手状态 ====================

  /**
   * 获取音频助手状态
   */
  async getAssistantState(projectId: string): Promise<AudioAssistantState | undefined> {
    try {
      return await db.assistantState.get(projectId);
    } catch (error) {
      console.error(`❌ [MiscRepository] 获取音频助手状态失败:`, error);
      return undefined;
    }
  }

  /**
   * 保存音频助手状态
   */
  async saveAssistantState(state: AudioAssistantState): Promise<void> {
    try {
      await db.assistantState.put(state);
      console.log(`✅ [MiscRepository] 保存音频助手状态成功: ${state.projectId}`);
    } catch (error) {
      console.error(`❌ [MiscRepository] 保存音频助手状态失败:`, error);
      throw error;
    }
  }

  /**
   * 删除音频助手状态
   */
  async deleteAssistantState(projectId: string): Promise<void> {
    try {
      await db.assistantState.delete(projectId);
      console.log(`✅ [MiscRepository] 删除音频助手状态成功: ${projectId}`);
    } catch (error) {
      console.error(`❌ [MiscRepository] 删除音频助手状态失败:`, error);
      throw error;
    }
  }

  // ==================== 目录句柄 ====================

  /**
   * 获取目录句柄
   */
  async getDirectoryHandle(projectId: string): Promise<DirectoryHandleEntry | undefined> {
    try {
      return await db.directoryHandles.get(projectId);
    } catch (error) {
      console.error(`❌ [MiscRepository] 获取目录句柄失败:`, error);
      return undefined;
    }
  }

  /**
   * 保存目录句柄
   */
  async saveDirectoryHandle(entry: DirectoryHandleEntry): Promise<void> {
    try {
      await db.directoryHandles.put(entry);
      console.log(`✅ [MiscRepository] 保存目录句柄成功: ${entry.projectId}`);
    } catch (error) {
      console.error(`❌ [MiscRepository] 保存目录句柄失败:`, error);
      throw error;
    }
  }

  /**
   * 删除目录句柄
   */
  async deleteDirectoryHandle(projectId: string): Promise<void> {
    try {
      await db.directoryHandles.delete(projectId);
      console.log(`✅ [MiscRepository] 删除目录句柄成功: ${projectId}`);
    } catch (error) {
      console.error(`❌ [MiscRepository] 删除目录句柄失败:`, error);
      throw error;
    }
  }

  // ==================== 批量操作 ====================

  /**
   * 批量获取多个配置
   */
  async getBulkConfig(): Promise<{
    mergeHistory: MergeHistoryEntry[];
    cvColorPresets: PresetColor[];
    characterColorPresets: PresetColor[];
    apiSettings: ApiSettings;
    localCodexSettings: LocalCodexSettings;
    selectedAiProvider: string;
    characterShortcuts: CharacterShortcuts;
    soundObservationList: string[];
    soundObservationByCategory: Record<string, string[]>;
  }> {
    try {
      const [
        mergeHistory,
        cvColorPresets,
        characterColorPresets,
        apiSettings,
        localCodexSettings,
        selectedAiProvider,
        characterShortcuts,
        soundObservationList,
        soundObservationByCategory,
      ] = await Promise.all([
        this.getMergeHistory(),
        this.getCvColorPresets(),
        this.getCharacterColorPresets(),
        this.getApiSettings(),
        this.getLocalCodexSettings(),
        this.getSelectedAiProvider(),
        this.getCharacterShortcuts(),
        this.getSoundObservationList(),
        this.getSoundObservationByCategory(),
      ]);

      return {
        mergeHistory,
        cvColorPresets,
        characterColorPresets,
        apiSettings,
        localCodexSettings,
        selectedAiProvider,
        characterShortcuts,
        soundObservationList,
        soundObservationByCategory,
      };
    } catch (error) {
      console.error('❌ [MiscRepository] 批量获取配置失败:', error);
      throw error;
    }
  }

  /**
   * 清除所有杂项数据（谨慎使用）
   */
  async clearAll(): Promise<void> {
    try {
      await db.misc.clear();
      console.log('✅ [MiscRepository] 清除所有杂项数据成功');
    } catch (error) {
      console.error('❌ [MiscRepository] 清除所有杂项数据失败:', error);
      throw error;
    }
  }

  /**
   * 获取所有键
   */
  async getAllKeys(): Promise<string[]> {
    try {
      const items = await db.misc.toArray();
      return items.map(item => item.key);
    } catch (error) {
      console.error('❌ [MiscRepository] 获取所有键失败:', error);
      return [];
    }
  }
}

// 导出单例实例
export const miscRepository = new MiscRepository();
