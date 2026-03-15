/**
 * CopilotPanel — full streaming chat with Ask/Agent modes.
 */

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from 'react';
import { useApp } from '../../context/AppContext';
import { streamChat, buildSystemPrompt, type CopilotMessage } from '../../services/copilot';

interface CopilotPanelProps {
  onClose: () => void;
}

export function CopilotPanel({ onClose }: CopilotPanelProps) {
  const { state, dispatch, vfs } = useApp();
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [mode, setMode] = useState<'ask' | 'agent'>('ask');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(scrollToBottom, [messages, streamingContent, scrollToBottom]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    if (!state.settings.githubPat) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: text },
        { role: 'assistant', content: '⚠️ No GitHub token configured. Go to **Settings → GitHub Token** to set one up.' },
      ]);
      setInput('');
      return;
    }

    const userMsg: CopilotMessage = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);
    setStreamingContent('');
    abortRef.current = false;

    // Build system prompt from workspace context
    const activeFile = state.activeTab || '';
    const activeEntry = activeFile ? vfs.get(activeFile) : undefined;
    const activeContent = activeEntry?.type === 'file' ? (activeEntry.content ?? '') : '';
    const allFiles = Array.from(vfs.entries())
      .filter(([, e]) => e.type === 'file')
      .map(([p]) => p);

    const systemPrompt = buildSystemPrompt(activeFile, activeContent, allFiles, mode);

    let fullContent = '';
    try {
      const stream = streamChat(
        state.settings.githubPat,
        state.settings.copilotModel,
        systemPrompt,
        newMessages,
      );

      for await (const delta of stream) {
        if (abortRef.current) break;
        fullContent += delta;
        setStreamingContent(fullContent);
      }

      // Apply agent edits if in agent mode
      if (mode === 'agent') {
        applyAgentEdits(fullContent);
      }
    } catch (err) {
      fullContent = `❌ Error: ${err instanceof Error ? err.message : String(err)}`;
    }

    setMessages((prev) => [...prev, { role: 'assistant', content: fullContent }]);
    setStreamingContent('');
    setStreaming(false);
  }, [input, streaming, messages, state.settings, state.activeTab, vfs, mode]);

  /** Parse and apply agent edit blocks from the response */
  const applyAgentEdits = useCallback((content: string) => {
    // Match ```edit:filename.py blocks
    const editRegex = /```edit:([^\n]+)\n([\s\S]*?)```/g;
    let editMatch;
    while ((editMatch = editRegex.exec(content)) !== null) {
      const filename = editMatch[1].trim();
      const body = editMatch[2];
      const entry = vfs.get(filename);
      if (!entry || entry.type !== 'file') continue;

      let fileContent = entry.content ?? '';
      const searchReplaceRegex = /<<<SEARCH\n([\s\S]*?)\n===\n([\s\S]*?)\nREPLACE>>>/g;
      let srMatch;
      while ((srMatch = searchReplaceRegex.exec(body)) !== null) {
        const search = srMatch[1];
        const replace = srMatch[2];
        fileContent = fileContent.replace(search, replace);
      }
      vfs.set(filename, fileContent);
      dispatch({ type: 'VFS_CHANGED' });
    }

    // Match ```newfile:filename.py blocks
    const newFileRegex = /```newfile:([^\n]+)\n([\s\S]*?)```/g;
    let newMatch;
    while ((newMatch = newFileRegex.exec(content)) !== null) {
      const filename = newMatch[1].trim();
      const fileContent = newMatch[2];
      vfs.set(filename, fileContent);
      dispatch({ type: 'VFS_CHANGED' });
      dispatch({ type: 'OPEN_FILE', path: filename });
    }
  }, [vfs, dispatch]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setStreamingContent('');
  }, []);

  return (
    <aside id="copilot-panel">
      <div className="copilot-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="codicon codicon-copilot" />
          <span style={{ fontWeight: 600 }}>Copilot</span>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            className={`copilot-mode-btn${mode === 'ask' ? ' active' : ''}`}
            onClick={() => setMode('ask')}
          >Ask</button>
          <button
            className={`copilot-mode-btn${mode === 'agent' ? ' active' : ''}`}
            onClick={() => setMode('agent')}
          >Agent</button>
          {messages.length > 0 && (
            <button className="icon-btn" title="Clear chat" onClick={clearHistory}>
              <span className="codicon codicon-clear-all" />
            </button>
          )}
          <button className="icon-btn" title="Close" onClick={onClose}>
            <span className="codicon codicon-close" />
          </button>
        </div>
      </div>

      <div className="copilot-messages" style={{ flex: 1, padding: 12, overflow: 'auto' }}>
        {messages.length === 0 && !streaming && (
          <div style={{ textAlign: 'center', color: 'var(--fg-secondary)', padding: '40px 16px' }}>
            <span className="codicon codicon-copilot" style={{ fontSize: 32, opacity: 0.4, display: 'block', marginBottom: 12 }} />
            How can I help you?<br />
            <span style={{ fontSize: 11 }}>Ask about your code, or switch to <strong>Agent</strong> mode to edit files.</span>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`copilot-message ${msg.role}`}>
            <div className="copilot-message-header">
              <span className={`codicon ${msg.role === 'user' ? 'codicon-account' : 'codicon-copilot'}`} />
              <span style={{ fontWeight: 600, fontSize: 11 }}>{msg.role === 'user' ? 'You' : 'Copilot'}</span>
            </div>
            <div
              className="copilot-message-content"
              style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5 }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {streaming && streamingContent && (
          <div className="copilot-message assistant">
            <div className="copilot-message-header">
              <span className="codicon codicon-copilot" />
              <span style={{ fontWeight: 600, fontSize: 11 }}>Copilot</span>
              <span className="codicon codicon-loading codicon-modifier-spin" style={{ marginLeft: 4 }} />
            </div>
            <div className="copilot-message-content" style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5 }}>
              {streamingContent}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="copilot-input-area" style={{ padding: '8px 12px', borderTop: '1px solid var(--border-primary)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            className="copilot-input"
            placeholder={mode === 'agent' ? 'Describe what to change...' : 'Ask Copilot...'}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming}
            style={{
              flex: 1, resize: 'none',
              background: 'var(--bg-input)', border: '1px solid var(--border-primary)',
              borderRadius: 6, padding: '6px 10px',
              color: 'var(--fg-primary)', fontFamily: 'var(--font-ui)', fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            className="copilot-send-btn"
            onClick={handleSend}
            disabled={streaming || !input.trim()}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: streaming || !input.trim() ? 'var(--bg-tertiary)' : 'var(--bg-button)',
              color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', cursor: streaming ? 'not-allowed' : 'pointer',
            }}
          >
            <span className="codicon codicon-send" />
          </button>
        </div>
      </div>
    </aside>
  );
}
