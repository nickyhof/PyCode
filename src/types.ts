/** Core shared types for PyCode IDE */

/** A single file in the virtual file system */
export interface VfsFile {
  path: string;
  content: string;
}

/** State for an open editor tab */
export interface Tab {
  path: string;
  isDirty: boolean;
}

/** File tree node */
export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

/** Git file status */
export interface GitFileStatus {
  filepath: string;
  status: string;
  head: string;
  workdir: string;
  stage: string;
}

/** Git log entry */
export interface GitLogEntry {
  sha: string;
  message: string;
  author: string;
  date: Date;
  dateStr: string;
}

/** Copilot chat message */
export interface CopilotMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** Sidebar panel identifiers */
export type SidebarPanel =
  | 'explorer'
  | 'search'
  | 'git'
  | 'extensions'
  | 'settings';

/** Application settings */
export interface AppSettings {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  gitUserName: string;
  gitUserEmail: string;
  githubPat: string;
  copilotModel: string;
  copilotInlineEnabled: boolean;
}

/** Default settings */
export const DEFAULT_SETTINGS: AppSettings = {
  fontSize: 14,
  tabSize: 4,
  wordWrap: true,
  minimap: false,
  gitUserName: '',
  gitUserEmail: '',
  githubPat: '',
  copilotModel: 'gpt-4o',
  copilotInlineEnabled: true,
};
