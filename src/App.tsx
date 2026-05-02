import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { useStore } from './store/useStore';
import { Character, CVStylesMap } from './types';
import ConfirmModal from './components/modal/ConfirmModal';
import CharacterAndCvStyleModal from './features/scriptEditor/components/editor_page_modal/CharacterAndCvStyleModal';
import AppRouter from './routing/AppRouter';
import { CogIcon, FilmIcon } from './components/ui/icons';
import SettingsModal from './components/modal/SettingsModal';
import { useWebSocket } from './hooks/useWebSocket';
import HotkeyControlPanel from './components/HotkeyControlPanel';
import { findSafeMergeTargetForRename } from './features/scriptEditor/utils/characterMergeOnRename';
import {
  applyCodexAssignmentsToStore,
  getActiveChapterSnapshotFromStore,
  applyCodexAssignmentsBatchToStore,
  getChapterSnapshotsFromStore,
} from './features/scriptEditor/services/codexChapterSync';

const App: React.FC = () => {
  const {
    currentView,
    projects,
    characters,
    selectedProjectId,
    selectedChapterId,
    isLoading,
    confirmModal,
    characterAndCvStyleModal,
    isSettingsModalOpen,
    loadInitialData,
    navigateTo,
    addCharacter,
    editCharacter,
    bulkUpdateCharacterStylesForCV,
    mergeCharacters,
    openConfirmModal,
    closeConfirmModal,
    closeCharacterAndCvStyleModal,
    openSettingsModal,
    closeSettingsModal,
    setWebSocketStatus,
    setWebSocketConnect,
  } = useStore();
  const rendererClientIdRef = useRef(
    'renderer_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
  );

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const webSocketSendRef = useRef<(data: unknown) => boolean>(() => false);

  const handleWebSocketMessage = useCallback((data: any) => {
    if (data.action === 'nextLine' && document.visibilityState === 'visible') {
      useStore.getState().goToNextLine();
      return;
    }

    if (data.action === 'requestChapterSnapshot') {
      void (async () => {
        try {
          const snapshot = getActiveChapterSnapshotFromStore({
            projectId: typeof data.projectId === 'string' ? data.projectId : undefined,
            chapterId: typeof data.chapterId === 'string' ? data.chapterId : undefined,
          });
          webSocketSendRef.current({
            action: 'chapterSnapshotResponse',
            requestId: data.requestId,
            ok: true,
            snapshot,
          });
        } catch (error) {
          webSocketSendRef.current({
            action: 'chapterSnapshotResponse',
            requestId: data.requestId,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })();
      return;
    }

    if (data.action === 'requestChapterSnapshots') {
      void (async () => {
        try {
          const bundle = getChapterSnapshotsFromStore({
            projectId: typeof data.projectId === 'string' ? data.projectId : undefined,
            chapterId: typeof data.chapterId === 'string' ? data.chapterId : undefined,
            chapterIds: Array.isArray(data.chapterIds)
              ? data.chapterIds.filter((chapterId): chapterId is string => typeof chapterId === 'string')
              : undefined,
            count: Number.isInteger(data.count) ? data.count : undefined,
          });
          webSocketSendRef.current({
            action: 'chapterSnapshotsResponse',
            requestId: data.requestId,
            ok: true,
            bundle,
          });
        } catch (error) {
          webSocketSendRef.current({
            action: 'chapterSnapshotsResponse',
            requestId: data.requestId,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })();
      return;
    }

    if (data.action === 'applyCodexAssignments') {
      void (async () => {
        try {
          const result = await applyCodexAssignmentsToStore({
            projectId: String(data.projectId || ''),
            chapterId: String(data.chapterId || ''),
            assignments: Array.isArray(data.assignments) ? data.assignments : [],
          });
          webSocketSendRef.current({
            action: 'codexAssignmentsApplied',
            requestId: data.requestId,
            ok: true,
            result,
          });
        } catch (error) {
          webSocketSendRef.current({
            action: 'codexAssignmentsApplied',
            requestId: data.requestId,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })();
      return;
    }

    if (data.action === 'applyCodexAssignmentsBatch') {
      void (async () => {
        try {
          const result = await applyCodexAssignmentsBatchToStore({
            projectId: String(data.projectId || ''),
            chapters: Array.isArray(data.chapters) ? data.chapters : [],
          });
          webSocketSendRef.current({
            action: 'codexAssignmentsBatchApplied',
            requestId: data.requestId,
            ok: true,
            result,
          });
        } catch (error) {
          webSocketSendRef.current({
            action: 'codexAssignmentsBatchApplied',
            requestId: data.requestId,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })();
    }
  }, []);

  // WebSocket 联动（全局控制器）
  const {
    status: wsStatus,
    connect: connectWebSocket,
    send: sendWebSocketMessage,
  } = useWebSocket({
    url: 'ws://127.0.0.1:9002',
    autoConnect: true,
    reconnectDelay: 5000,
    autoReconnect: true,
    onMessage: handleWebSocketMessage,
  });

  useEffect(() => {
    webSocketSendRef.current = sendWebSocketMessage;
  }, [sendWebSocketMessage]);

  useEffect(() => {
    setWebSocketStatus(wsStatus);
  }, [wsStatus, setWebSocketStatus]);

  useEffect(() => {
    setWebSocketConnect(connectWebSocket);
    return () => setWebSocketConnect(null);
  }, [connectWebSocket, setWebSocketConnect]);

  const sendRendererClientState = useCallback(() => {
    if (wsStatus !== 'connected') return;
    sendWebSocketMessage({
      action: 'updateClientState',
      role: 'renderer',
      clientId: rendererClientIdRef.current,
      currentView,
      selectedProjectId: selectedProjectId || null,
      selectedChapterId: selectedChapterId || null,
      visibilityState:
        typeof document !== 'undefined' ? document.visibilityState : 'hidden',
      hasFocus:
        typeof document !== 'undefined' && typeof document.hasFocus === 'function'
          ? document.hasFocus()
          : true,
      locationHref: typeof window !== 'undefined' ? window.location.href : '',
    });
  }, [
    currentView,
    selectedChapterId,
    selectedProjectId,
    sendWebSocketMessage,
    wsStatus,
  ]);

  useEffect(() => {
    if (wsStatus !== 'connected') return;
    sendWebSocketMessage({
      action: 'registerClient',
      role: 'renderer',
      clientId: rendererClientIdRef.current,
    });
    sendRendererClientState();
  }, [sendRendererClientState, sendWebSocketMessage, wsStatus]);

  useEffect(() => {
    sendRendererClientState();
  }, [sendRendererClientState]);

  useEffect(() => {
    if (wsStatus !== 'connected') return;

    const handleClientStateChange = () => {
      sendRendererClientState();
    };

    window.addEventListener('focus', handleClientStateChange);
    window.addEventListener('blur', handleClientStateChange);
    document.addEventListener('visibilitychange', handleClientStateChange);

    return () => {
      window.removeEventListener('focus', handleClientStateChange);
      window.removeEventListener('blur', handleClientStateChange);
      document.removeEventListener('visibilitychange', handleClientStateChange);
    };
  }, [sendRendererClientState, wsStatus]);

  // 项目级 CV 名与样式
  const { projectCvStyles, projectCvNames } = useMemo<{
    projectCvStyles: CVStylesMap;
    projectCvNames: string[];
  }>(() => {
    const currentProject = projects.find((p) => p.id === selectedProjectId);
    if (!currentProject) return { projectCvStyles: {}, projectCvNames: [] };
    const projectCharacters = characters.filter(
      (c) => !c.projectId || c.projectId === selectedProjectId
    );
    const cvNames = projectCharacters
      .reduce<string[]>((acc, c) => {
        if (c.cvName && !acc.includes(c.cvName)) acc.push(c.cvName);
        return acc;
      }, [])
      .sort();
    return { projectCvStyles: currentProject.cvStyles || {}, projectCvNames: cvNames };
  }, [selectedProjectId, projects, characters]);

  // 统一保存入口（角色/CV）
  const handleSaveFromUnifiedModal = useCallback(
    async (
      characterData: Character,
      cvName: string,
      cvBgColor: string,
      cvTextColor: string
    ) => {
      const currentEditing = characterAndCvStyleModal.characterToEdit;
      const isNewCharacter =
        !currentEditing || !characterData.projectId;

      const proceedNormalSave = async () => {
        if (isNewCharacter) {
          if (!selectedProjectId) {
            alert('当前无法在未选择项目的情况下创建角色');
            return;
          }
          const newChar = addCharacter(characterData, selectedProjectId);
          await editCharacter(newChar, cvName, cvBgColor, cvTextColor);
        } else {
          await editCharacter(characterData, cvName, cvBgColor, cvTextColor);
        }
        if (cvName && cvBgColor && cvTextColor) {
          await bulkUpdateCharacterStylesForCV(cvName, cvBgColor, cvTextColor);
        }
        closeCharacterAndCvStyleModal();
      };

      // When editing: if user renames to an existing role name, offer one-click merge.
      if (!isNewCharacter && currentEditing) {
        const desiredName = characterData.name?.trim() || '';
        const originalName = currentEditing.name?.trim() || '';
        const nameChanged =
          desiredName.toLowerCase() !== originalName.toLowerCase() && desiredName !== '';

        if (nameChanged) {
          const { target, reason, matches } = findSafeMergeTargetForRename(
            characters,
            currentEditing,
            desiredName,
          );

          if (reason === 'multiple_matches') {
            alert(
              `检测到多个同名角色“${desiredName}”，无法自动合并。\n请使用右侧角色面板的“合并”按钮手动选择目标角色。`,
            );
            return;
          }

          if (reason === 'unsafe_scope' && matches && matches.length > 0) {
            // Don't offer merging into another scope automatically; it's easy to break cross-project visibility.
            // Continue with normal rename (may create duplicate names) only if user explicitly wants it.
            openConfirmModal(
              '同名角色在不同项目',
              `检测到已有角色名“${desiredName}”，但它不在当前项目作用域内。\n自动合并可能导致其它项目的台词引用到一个“只属于某个项目”的角色，从而出现显示/筛选异常。\n\n建议：先在当前项目内选择正确目标角色再合并。\n\n是否仍要继续“仅改名”（不合并）？`,
              () => {
                void proceedNormalSave().catch((e) => console.error('Save failed', e));
              },
              '继续改名',
              '取消',
            );
            return;
          }

          if (target) {
            openConfirmModal(
              '发现同名角色',
              `检测到已有角色名“${desiredName}”。\n\n推荐操作：把当前角色“${originalName}”合并到“${target.name}”，系统会迁移所有台词行并隐藏当前角色（可撤销合并）。\n\n注意：选择“合并”后，本次在弹窗里对名称/CV/样式的修改不会应用到目标角色。`,
              () => {
                void (async () => {
                  try {
                    await mergeCharacters([currentEditing.id], target.id);
                    closeCharacterAndCvStyleModal();
                  } catch (e) {
                    console.error('Merge failed', e);
                    alert(e instanceof Error ? e.message : '合并失败');
                  }
                })();
              },
              '合并到同名角色',
              '继续改名',
              () => {
                void proceedNormalSave().catch((e) => console.error('Save failed', e));
              },
            );
            return;
          }
        }
      }

      await proceedNormalSave();
    },
    [
      characterAndCvStyleModal.characterToEdit,
      addCharacter,
      editCharacter,
      bulkUpdateCharacterStylesForCV,
      mergeCharacters,
      openConfirmModal,
      closeCharacterAndCvStyleModal,
      selectedProjectId,
      characters,
    ]
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-900">
      <header className="bg-slate-800 text-white p-3 shadow-md flex-shrink-0 border-b border-slate-700 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-sky-400">AI 有声内容创作</h1>
        <nav className="space-x-3 flex items-center">
          {currentView !== 'upload' && (
            <button
              onClick={() => navigateTo('upload')}
              className="text-sm text-sky-300 hover:text-sky-100"
            >
              上传文件
            </button>
          )}
          {currentView !== 'dashboard' && projects.length > 0 && (
            <button
              onClick={() => navigateTo('dashboard')}
              className="text-sm text-sky-300 hover:text-sky-100"
            >
              我的项目
            </button>
          )}
          {currentView !== 'editor' && selectedProjectId && projects.length > 0 && (
            <button
              onClick={() => navigateTo('editor')}
              className="text-sm text-sky-300 hover:text-sky-100"
            >
              编辑项目
            </button>
          )}
          {currentView !== 'audioAlignment' && projects.length > 0 && (
            <button
              onClick={() => navigateTo('audioAlignment')}
              className="text-sm text-sky-300 hover:text-sky-100"
            >
              音频对轨
            </button>
          )}
           {currentView !== 'postProduction' && projects.length > 0 && (
            <button
              onClick={() => navigateTo('postProduction')}
              className="text-sm text-sky-300 hover:text-sky-100"
            >
              后期制作
            </button>
          )}
          {currentView !== 'audioAlignmentAssistant' && projects.length > 0 && (
            <button
              onClick={() => navigateTo('audioAlignmentAssistant')}
              className="text-sm text-sky-300 hover:text-sky-100"
            >
              对轨助手
            </button>
          )}
          {currentView !== 'voiceLibrary' && projects.length > 0 && (
            <button
              onClick={() => navigateTo('voiceLibrary')}
              className="text-sm text-sky-300 hover:text-sky-100"
            >
              音色库
            </button>
          )}
          {currentView !== 'cvManagement' && characters.length > 0 && (
            <button
              onClick={() => navigateTo('cvManagement')}
              className="text-sm text-sky-300 hover:text-sky-100"
            >
              CV 管理
            </button>
          )}
          {currentView !== 'tools' && projects.length > 0 && (
            <button
              onClick={() => navigateTo('tools')}
              className="text-sm text-sky-300 hover:text-sky-100"
            >
              辅助工具
            </button>
          )}
          <button
            onClick={openSettingsModal}
            className="text-sm text-sky-300 hover:text-sky-100 p-2 rounded-full hover:bg-slate-700"
            title="设置"
          >
            <CogIcon className="w-5 h-5" />
          </button>
        </nav>
      </header>
      <main className="flex-grow overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[100]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
            <p className="ml-3 text-slate-100">加载中...</p>
          </div>
        )}
        <AppRouter />
      </main>
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={() => {
          confirmModal.onConfirm();
          closeConfirmModal();
        }}
        onCancel={() => {
          if (confirmModal.onCancel) confirmModal.onCancel();
          closeConfirmModal();
        }}
        confirmButtonText={confirmModal.confirmText}
        cancelButtonText={confirmModal.cancelText}
      />
      {characterAndCvStyleModal.isOpen && (
        <CharacterAndCvStyleModal
          isOpen={characterAndCvStyleModal.isOpen}
          onClose={closeCharacterAndCvStyleModal}
          onSave={handleSaveFromUnifiedModal}
          characterToEdit={characterAndCvStyleModal.characterToEdit}
          allCvNames={projectCvNames}
          cvStyles={projectCvStyles}
        />
      )}
      <SettingsModal isOpen={isSettingsModalOpen} onClose={closeSettingsModal} />
      <HotkeyControlPanel />
    </div>
  );
};

export default App;
