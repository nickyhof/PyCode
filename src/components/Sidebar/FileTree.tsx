import { useState, useCallback, type MouseEvent } from 'react';
import { useApp } from '../../context/AppContext';
import { useDialog } from '../Dialog/Dialog';
import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from '../ContextMenu/ContextMenu';
import type { TreeNode } from '../../services/vfs';

/** Map file extension to codicon + color class */
function fileIcon(path: string): { icon: string; color: string } {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, { icon: string; color: string }> = {
    py: { icon: 'codicon-symbol-method', color: 'file-python' },
    js: { icon: 'codicon-symbol-event', color: 'file-python' },
    ts: { icon: 'codicon-symbol-event', color: 'file-python' },
    json: { icon: 'codicon-json', color: 'file-json' },
    md: { icon: 'codicon-markdown', color: 'file-md' },
    html: { icon: 'codicon-code', color: 'file-text' },
    css: { icon: 'codicon-symbol-color', color: 'file-python' },
    txt: { icon: 'codicon-file-text', color: 'file-text' },
    bazel: { icon: 'codicon-flame', color: 'file-json' },
    ipynb: { icon: 'codicon-book', color: 'file-python' },
    toml: { icon: 'codicon-settings', color: 'file-default' },
  };
  return map[ext] || { icon: 'codicon-file', color: 'file-default' };
}

function gitStatusBadge(status: string): { letter: string; cls: string; treeCls: string } {
  switch (status) {
    case 'modified': case 'staged': case 'staged-modified':
      return { letter: 'M', cls: 'git-modified', treeCls: 'git-modified' };
    case 'added': case 'added-modified':
      return { letter: 'A', cls: 'git-added', treeCls: 'git-added' };
    case 'deleted': case 'deleted-staged':
      return { letter: 'D', cls: 'git-deleted', treeCls: 'git-deleted' };
    case 'untracked':
      return { letter: 'U', cls: 'git-untracked', treeCls: 'git-untracked' };
    default:
      return { letter: '?', cls: '', treeCls: '' };
  }
}

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  onContextMenu: (e: MouseEvent, node: TreeNode) => void;
}

function TreeItem({ node, depth, onContextMenu }: TreeItemProps) {
  const { state, dispatch } = useApp();
  const isDir = node.type === 'directory';
  const isExpanded = state.expandedDirs.has(node.path);

  const sortedChildren = Object.values(node.children).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  if (isDir) {
    return (
      <>
        <div
          className={`tree-item${state.activeTab === node.path ? ' active' : ''}`}
          onClick={() => dispatch({ type: 'TOGGLE_DIR', path: node.path })}
          onContextMenu={(e) => onContextMenu(e, node)}
        >
          {Array.from({ length: depth }).map((_, i) => (
            <span key={i} className="tree-indent" />
          ))}
          <span className={`tree-arrow codicon codicon-chevron-right${isExpanded ? ' expanded' : ''}`} />
          <span className={`tree-icon codicon ${isExpanded ? 'codicon-folder-opened folder-open' : 'codicon-folder folder'}`} />
          <span className="tree-label">{node.name}</span>
        </div>
        {isExpanded && sortedChildren.map((child) => (
          <TreeItem key={child.path} node={child} depth={depth + 1} onContextMenu={onContextMenu} />
        ))}
      </>
    );
  }

  // File
  const { icon, color } = fileIcon(node.path);
  const gitSt = state.gitStatusMap[node.path];
  const badge = gitSt ? gitStatusBadge(gitSt) : null;

  return (
    <div
      className={`tree-item${state.activeTab === node.path ? ' active' : ''}${badge ? ' ' + badge.treeCls : ''}`}
      onClick={() => dispatch({ type: 'OPEN_FILE', path: node.path })}
      onContextMenu={(e) => onContextMenu(e, node)}
    >
      {Array.from({ length: depth }).map((_, i) => (
        <span key={i} className="tree-indent" />
      ))}
      <span className="tree-arrow hidden" />
      <span className={`tree-icon ${color} codicon ${icon}`} />
      <span className="tree-label">{node.name}</span>
      {badge && <span className={`tree-git-status ${badge.cls}`}>{badge.letter}</span>}
    </div>
  );
}

export function FileTree() {
  const { vfs, dispatch } = useApp();
  const { prompt, confirm } = useDialog();
  const tree = vfs.tree();
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null);
  const [bgCtxMenu, setBgCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: MouseEvent, node: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();
    setBgCtxMenu(null);
    setCtxMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const handleBgContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    setCtxMenu(null);
    setBgCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeMenu = useCallback(() => { setCtxMenu(null); setBgCtxMenu(null); }, []);

  const handleRename = useCallback(async () => {
    if (!ctxMenu) return;
    const node = ctxMenu.node;
    closeMenu();
    const newName = await prompt({ title: 'Rename', defaultValue: node.name, placeholder: 'Enter new name...' });
    if (!newName || newName === node.name) return;
    const oldPath = node.path;
    const parentPath = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : '';
    const newPath = parentPath ? parentPath + '/' + newName : newName;
    vfs.rename(oldPath, newPath);
    dispatch({ type: 'VFS_CHANGED' });
    dispatch({ type: 'RENAME_TAB', oldPath, newPath });
  }, [ctxMenu, vfs, dispatch, closeMenu, prompt]);

  const handleDelete = useCallback(async () => {
    if (!ctxMenu) return;
    const node = ctxMenu.node;
    closeMenu();
    const ok = await confirm({ title: 'Delete', message: `Are you sure you want to delete "${node.name}"?`, danger: true });
    if (!ok) return;
    vfs.delete(node.path);
    dispatch({ type: 'VFS_CHANGED' });
    dispatch({ type: 'CLOSE_TAB', path: node.path });
  }, [ctxMenu, vfs, dispatch, closeMenu, confirm]);

  const handleNewFile = useCallback(async (base?: string) => {
    closeMenu();
    const name = await prompt({ title: 'New File', placeholder: 'Enter file name...' });
    if (!name) return;
    const path = base ? base + '/' + name : name;
    vfs.set(path, '');
    dispatch({ type: 'VFS_CHANGED' });
    dispatch({ type: 'OPEN_FILE', path });
  }, [vfs, dispatch, closeMenu, prompt]);

  const handleNewNotebook = useCallback(async (base?: string) => {
    closeMenu();
    const name = await prompt({ title: 'New Notebook', defaultValue: 'untitled.ipynb', placeholder: 'Enter notebook name...' });
    if (!name) return;
    const nbName = name.endsWith('.ipynb') ? name : name + '.ipynb';
    const emptyNotebook = JSON.stringify({
      cells: [{ cell_type: 'code', source: '', metadata: {}, outputs: [], execution_count: null }],
      metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' } },
      nbformat: 4, nbformat_minor: 5
    }, null, 2);
    const path = base ? base + '/' + nbName : nbName;
    vfs.set(path, emptyNotebook);
    dispatch({ type: 'VFS_CHANGED' });
    dispatch({ type: 'OPEN_FILE', path });
  }, [vfs, dispatch, closeMenu, prompt]);

  const sortedRootChildren = Object.values(tree.children).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div id="file-tree" onContextMenu={handleBgContextMenu}>
      {sortedRootChildren.map((child) => (
        <TreeItem key={child.path} node={child} depth={0} onContextMenu={handleContextMenu} />
      ))}

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={closeMenu}>
          <ContextMenuItem icon="codicon-new-file" label="New File" onClick={() => handleNewFile(ctxMenu.node.type === 'directory' ? ctxMenu.node.path : '')} />
          <ContextMenuItem icon="codicon-notebook" label="New Notebook" onClick={() => handleNewNotebook(ctxMenu.node.type === 'directory' ? ctxMenu.node.path : '')} />
          <ContextMenuSeparator />
          <ContextMenuItem icon="codicon-edit" label="Rename" onClick={handleRename} />
          <ContextMenuItem icon="codicon-trash" label="Delete" danger onClick={handleDelete} />
        </ContextMenu>
      )}

      {bgCtxMenu && (
        <ContextMenu x={bgCtxMenu.x} y={bgCtxMenu.y} onClose={closeMenu}>
          <ContextMenuItem icon="codicon-new-file" label="New File" onClick={() => handleNewFile()} />
          <ContextMenuItem icon="codicon-notebook" label="New Notebook" onClick={() => handleNewNotebook()} />
        </ContextMenu>
      )}
    </div>
  );
}
