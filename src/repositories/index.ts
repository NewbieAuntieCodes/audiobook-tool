/**
 * Repository 层统一导出
 *
 * 提供所有数据仓库的单一导入入口
 *
 * @example
 * ```typescript
 * import { projectRepository, characterRepository } from '@/repositories';
 *
 * const projects = await projectRepository.getAll();
 * const character = await characterRepository.create({...});
 * ```
 */

export { ProjectRepository, projectRepository } from './projectRepository';
export { CharacterRepository, characterRepository } from './characterRepository';
export { AudioRepository, audioRepository } from './audioRepository';
export { MiscRepository, miscRepository } from './miscRepository';
export { VoiceLibraryPromptRepository, voiceLibraryPromptRepository } from './voiceLibraryPromptRepository';
export { soundLibraryRepository } from './soundLibraryRepository';
export { roleLibraryRepository } from './roleLibraryRepository';
export { sfxGroupLibraryRepository } from './sfxGroupLibraryRepository';

export type { CreateCharacterInput } from './characterRepository';
// FIX: Export ApiSettings from miscRepository to resolve module export error.
export type { ApiSettings, CharacterShortcuts } from './miscRepository';
