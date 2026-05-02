/**
 * 角色数据操作层 (Character Repository)
 *
 * 职责：
 * - 统一管理角色相关的数据库操作
 * - 提供角色查询、创建、更新、删除功能
 * - 处理角色合并逻辑
 */

import { db } from '../db';
import { Character } from '../types';
import { normalizeCharacterNameKey, sanitizeCharacterDisplayName } from '../lib/characterName';

/**
 * 创建角色的输入类型
 */
export interface CreateCharacterInput {
  id?: string;
  name: string;
  projectId: string;
  color: string;
  textColor?: string;
  cvName?: string;
  description?: string;
  profile?: Character['profile'];
  isStyleLockedToCv?: boolean;
}

/**
 * 角色数据仓库
 */
export class CharacterRepository {
  /**
   * 获取所有角色
   */
  async getAll(): Promise<Character[]> {
    try {
      const characters = await db.characters.toArray();
      return characters.map(c => ({
        ...c,
        isStyleLockedToCv: c.isStyleLockedToCv || false,
        status: c.status || 'active',
      }));
    } catch (error) {
      console.error('❌ [CharacterRepository] 获取所有角色失败:', error);
      throw new Error('获取角色列表失败');
    }
  }

  /**
   * 根据ID获取角色
   */
  async getById(characterId: string): Promise<Character | undefined> {
    try {
      return await db.characters.get(characterId);
    } catch (error) {
      console.error(`❌ [CharacterRepository] 获取角色 ${characterId} 失败:`, error);
      throw new Error(`获取角色失败: ${characterId}`);
    }
  }

  /**
   * 根据项目ID获取角色
   */
  async getByProjectId(projectId: string): Promise<Character[]> {
    try {
      const characters = await db.characters.where('projectId').equals(projectId).toArray();
      return characters.map(c => ({
        ...c,
        isStyleLockedToCv: c.isStyleLockedToCv || false,
        status: c.status || 'active',
      }));
    } catch (error) {
      console.error(`❌ [CharacterRepository] 获取项目 ${projectId} 的角色失败:`, error);
      throw new Error(`获取项目角色失败: ${projectId}`);
    }
  }

  /**
   * 根据名称和项目ID查找角色（忽略已合并的角色）
   */
  async findByNameAndProject(name: string, projectId: string): Promise<Character | undefined> {
    try {
      const key = normalizeCharacterNameKey(name);
      const characters = await db.characters
        .where('projectId')
        .equals(projectId)
        .toArray();

      return characters.find(
        c => normalizeCharacterNameKey(c.name) === key && c.status !== 'merged'
      );
    } catch (error) {
      console.error(`❌ [CharacterRepository] 查找角色失败:`, error);
      return undefined;
    }
  }

  /**
   * 创建角色
   */
  async create(input: CreateCharacterInput): Promise<Character> {
    try {
      // 检查是否已存在同名角色
      const existing = await this.findByNameAndProject(input.name, input.projectId);
      if (existing) {
        console.log(`✅ [CharacterRepository] 角色已存在，返回现有角色:`, existing.id);
        return existing;
      }

      const displayName = sanitizeCharacterDisplayName(input.name);
      const character: Character = {
        id: input.id || `${Date.now()}_char_${Math.random().toString(36).substr(2, 9)}`,
        name: displayName,
        projectId: input.projectId,
        color: input.color,
        textColor: input.textColor || '',
        cvName: input.cvName || '',
        description: input.description || '',
        profile: input.profile,
        isStyleLockedToCv: input.isStyleLockedToCv ?? false,
        status: 'active',
      };

      await db.characters.add(character);
      console.log('✅ [CharacterRepository] 创建角色成功:', character.id);
      return character;
    } catch (error) {
      console.error('❌ [CharacterRepository] 创建角色失败:', error);
      throw new Error('创建角色失败');
    }
  }

  /**
   * 批量创建角色
   */
  async bulkCreate(characters: Character[]): Promise<void> {
    try {
      await db.characters.bulkAdd(characters);
      console.log(`✅ [CharacterRepository] 批量创建 ${characters.length} 个角色成功`);
    } catch (error) {
      console.error('❌ [CharacterRepository] 批量创建角色失败:', error);
      throw new Error('批量创建角色失败');
    }
  }

  /**
   * 更新角色
   */
  async update(character: Character): Promise<void> {
    try {
      await db.characters.put(character);
      console.log('✅ [CharacterRepository] 更新角色成功:', character.id);
    } catch (error) {
      console.error(`❌ [CharacterRepository] 更新角色 ${character.id} 失败:`, error);
      throw new Error(`更新角色失败: ${character.id}`);
    }
  }

  /**
   * 批量更新角色
   */
  async bulkUpdate(characters: Character[]): Promise<void> {
    try {
      await db.characters.bulkPut(characters);
      console.log(`✅ [CharacterRepository] 批量更新 ${characters.length} 个角色成功`);
    } catch (error) {
      console.error('❌ [CharacterRepository] 批量更新角色失败:', error);
      throw new Error('批量更新角色失败');
    }
  }

  /**
   * 删除角色
   */
  async delete(characterId: string): Promise<void> {
    try {
      await db.characters.delete(characterId);
      console.log('✅ [CharacterRepository] 删除角色成功:', characterId);
    } catch (error) {
      console.error(`❌ [CharacterRepository] 删除角色 ${characterId} 失败:`, error);
      throw new Error(`删除角色失败: ${characterId}`);
    }
  }

  /**
   * 批量删除角色
   */
  async bulkDelete(characterIds: string[]): Promise<void> {
    try {
      await db.characters.bulkDelete(characterIds);
      console.log(`✅ [CharacterRepository] 批量删除 ${characterIds.length} 个角色成功`);
    } catch (error) {
      console.error('❌ [CharacterRepository] 批量删除角色失败:', error);
      throw new Error('批量删除角色失败');
    }
  }

  /**
   * 根据项目ID删除所有角色
   */
  async deleteByProjectId(projectId: string): Promise<number> {
    try {
      const count = await db.characters.where('projectId').equals(projectId).delete();
      console.log(`✅ [CharacterRepository] 删除项目 ${projectId} 的 ${count} 个角色成功`);
      return count;
    } catch (error) {
      console.error(`❌ [CharacterRepository] 删除项目角色失败:`, error);
      throw new Error(`删除项目角色失败: ${projectId}`);
    }
  }

  /**
   * 切换角色样式锁定状态
   */
  async toggleStyleLock(characterId: string): Promise<Character> {
    try {
      const character = await this.getById(characterId);
      if (!character) {
        throw new Error(`角色不存在: ${characterId}`);
      }

      const updated: Character = {
        ...character,
        isStyleLockedToCv: !character.isStyleLockedToCv,
      };

      await this.update(updated);
      return updated;
    } catch (error) {
      console.error(`❌ [CharacterRepository] 切换样式锁定失败:`, error);
      throw error;
    }
  }

  /**
   * 批量更新指定CV的所有角色样式（不包括锁定的角色）
   */
  async bulkUpdateStylesForCV(
    projectId: string,
    cvName: string,
    bgColor: string,
    textColor: string
  ): Promise<Character[]> {
    try {
      const characters = await this.getByProjectId(projectId);
      const toUpdate = characters.filter(
        c => c.cvName === cvName && !c.isStyleLockedToCv && c.status === 'active'
      );

      if (toUpdate.length === 0) {
        console.log(`ℹ️ [CharacterRepository] 没有需要更新样式的角色 (CV: ${cvName})`);
        return [];
      }

      const updated = toUpdate.map(c => ({
        ...c,
        color: bgColor,
        textColor: textColor,
      }));

      await this.bulkUpdate(updated);
      console.log(`✅ [CharacterRepository] 批量更新 CV "${cvName}" 的 ${updated.length} 个角色样式成功`);
      return updated;
    } catch (error) {
      console.error(`❌ [CharacterRepository] 批量更新CV样式失败:`, error);
      throw error;
    }
  }

  /**
   * 标记角色为已合并
   */
  async markAsMerged(characterId: string, targetCharacterId: string): Promise<void> {
    try {
      const character = await this.getById(characterId);
      if (!character) {
        throw new Error(`角色不存在: ${characterId}`);
      }

      const updated: Character = {
        ...character,
        status: 'merged',
        mergedIntoCharacterId: targetCharacterId,
      };

      await this.update(updated);
      console.log(`✅ [CharacterRepository] 标记角色为已合并: ${characterId} -> ${targetCharacterId}`);
    } catch (error) {
      console.error(`❌ [CharacterRepository] 标记角色合并失败:`, error);
      throw error;
    }
  }

  /**
   * 批量标记角色为已合并
   */
  async bulkMarkAsMerged(characterIds: string[], targetCharacterId: string): Promise<void> {
    try {
      const characters = await db.characters.bulkGet(characterIds);
      const updated = characters
        .filter((c): c is Character => c !== undefined)
        .map(c => ({
          ...c,
          status: 'merged' as const,
          mergedIntoCharacterId: targetCharacterId,
        }));

      await this.bulkUpdate(updated);
      console.log(`✅ [CharacterRepository] 批量标记 ${updated.length} 个角色为已合并`);
    } catch (error) {
      console.error(`❌ [CharacterRepository] 批量标记角色合并失败:`, error);
      throw error;
    }
  }
}

// 导出单例实例
export const characterRepository = new CharacterRepository();
