/**
 * TerminalPanel — xterm.js terminal with command handling.
 */

import { useRef, useEffect, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useApp } from '../../context/AppContext';

interface TerminalPanelProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function TerminalPanel({ collapsed, onToggle }: TerminalPanelProps) {
  const { vfs } = useApp();
  const termContainerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const cmdBufRef = useRef('');

  const writePrompt = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    term.write('\r\n\x1b[36m❯\x1b[0m ');
  }, []);

  const handleCommand = useCallback((cmd: string) => {
    const term = termRef.current;
    if (!term) return;
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0];

    switch (command) {
      case '':
        break;
      case 'clear':
        term.clear();
        break;
      case 'ls': {
        const tree = vfs.tree();
        const children = Object.values(tree.children).sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        for (const child of children) {
          if (child.type === 'directory') {
            term.write(`\r\n\x1b[34m${child.name}/\x1b[0m`);
          } else {
            term.write(`\r\n${child.name}`);
          }
        }
        break;
      }
      case 'cat': {
        const path = parts[1];
        if (!path) { term.write('\r\n\x1b[33mUsage: cat <file>\x1b[0m'); break; }
        const entry = vfs.get(path);
        if (!entry || entry.type !== 'file') {
          term.write(`\r\n\x1b[31mFile not found: ${path}\x1b[0m`);
        } else {
          term.write(`\r\n${entry.content}`);
        }
        break;
      }
      case 'python':
      case 'python3': {
        const file = parts[1];
        if (!file) {
          term.write('\r\n\x1b[33mUsage: python <file.py>\x1b[0m');
        } else {
          term.write(`\r\n\x1b[90m$ python ${file}\x1b[0m`);
          term.write('\r\n\x1b[33m⚠ Pyodide not yet connected in this build\x1b[0m');
        }
        break;
      }
      case 'uv': {
        const sub = parts[1];
        if (!sub) {
          term.write('\r\n\x1b[33mUsage: uv sync | uv run <file> | uv pip install <pkg>\x1b[0m');
        } else {
          term.write(`\r\n\x1b[90m$ ${cmd}\x1b[0m`);
          term.write('\r\n\x1b[33m⚠ UV commands not yet connected in this build\x1b[0m');
        }
        break;
      }
      case 'bazel': {
        const sub = parts[1];
        if (!sub) {
          term.write('\r\n\x1b[33mUsage: bazel query | bazel run | bazel test | bazel build\x1b[0m');
        } else {
          term.write(`\r\n\x1b[90m$ ${cmd}\x1b[0m`);
          term.write('\r\n\x1b[33m⚠ Bazel commands not yet connected in this build\x1b[0m');
        }
        break;
      }
      case 'help':
        term.write('\r\n\x1b[36mAvailable commands:\x1b[0m');
        term.write('\r\n  clear          Clear the terminal');
        term.write('\r\n  ls             List files');
        term.write('\r\n  cat <file>     Display file contents');
        term.write('\r\n  python <file>  Run a Python file');
        term.write('\r\n  uv sync        Sync workspace');
        term.write('\r\n  uv run <file>  Run with UV');
        term.write('\r\n  bazel query    List targets');
        term.write('\r\n  bazel run      Run a target');
        term.write('\r\n  help           Show this help');
        break;
      default:
        term.write(`\r\n\x1b[31mCommand not found: ${command}\x1b[0m`);
        term.write('\r\n\x1b[90mType "help" for available commands\x1b[0m');
    }

    writePrompt();
  }, [vfs, writePrompt]);

  useEffect(() => {
    if (!termContainerRef.current || termRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#ffffff',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#264f78',
      },
      fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
      fontSize: 13,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowTransparency: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termContainerRef.current);
    fit.fit();

    // Banner
    term.writeln('\x1b[36m╔═══════════════════════════════════════╗\x1b[0m');
    term.writeln('\x1b[36m║          PyCode Terminal              ║\x1b[0m');
    term.writeln('\x1b[36m╚═══════════════════════════════════════╝\x1b[0m');
    term.writeln('');
    term.writeln('\x1b[90mType "help" for available commands\x1b[0m');
    term.write('\r\n\x1b[36m❯\x1b[0m ');

    // Handle key input
    term.onData((data) => {
      if (data === '\r') {
        // Enter
        const cmd = cmdBufRef.current;
        cmdBufRef.current = '';
        handleCommand(cmd);
      } else if (data === '\x7f') {
        // Backspace
        if (cmdBufRef.current.length > 0) {
          cmdBufRef.current = cmdBufRef.current.slice(0, -1);
          term.write('\b \b');
        }
      } else if (data === '\x03') {
        // Ctrl+C
        cmdBufRef.current = '';
        term.write('^C');
        writePrompt();
      } else if (data >= ' ') {
        // Printable character
        cmdBufRef.current += data;
        term.write(data);
      }
    });

    termRef.current = term;
    fitRef.current = fit;

    const onResize = () => fit.fit();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      term.dispose();
    };
  }, [handleCommand, writePrompt]);

  useEffect(() => {
    if (!collapsed && fitRef.current) {
      setTimeout(() => fitRef.current?.fit(), 50);
    }
  }, [collapsed]);

  const handleClear = useCallback(() => {
    termRef.current?.clear();
  }, []);

  return (
    <div id="panel" className={collapsed ? 'collapsed' : ''}>
      <div id="panel-header">
        <div className="panel-tabs">
          <div className="panel-tab active">
            <span className="codicon codicon-terminal" />
            Terminal
          </div>
        </div>
        <div className="panel-actions" style={{ display: 'flex', gap: 2 }}>
          <button className="icon-btn" title="Clear" onClick={handleClear}>
            <span className="codicon codicon-clear-all" />
          </button>
          <button className="icon-btn" title="Toggle" onClick={onToggle}>
            <span className="codicon codicon-chevron-down" />
          </button>
        </div>
      </div>
      <div
        id="terminal-container"
        ref={termContainerRef}
        style={{ flex: 1, overflow: 'hidden' }}
      />
    </div>
  );
}
