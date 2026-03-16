/**
 * Dialog — replacement for window.prompt() and window.confirm()
 * that works reliably in React.
 */

import { useState, useEffect, useRef, useCallback, createContext, useContext, type ReactNode } from 'react';

interface PromptOptions {
  title: string;
  defaultValue?: string;
  placeholder?: string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  danger?: boolean;
}

type DialogState =
  | { mode: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void }
  | { mode: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void };

interface DialogContextValue {
  prompt: (options: PromptOptions) => Promise<string | null>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (dialog?.mode === 'prompt') {
      setValue(dialog.options.defaultValue ?? '');
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (dialog?.mode === 'confirm') {
      setTimeout(() => okRef.current?.focus(), 0);
    }
  }, [dialog]);

  const prompt = useCallback((options: PromptOptions): Promise<string | null> => {
    return new Promise((resolve) => {
      setDialog({ mode: 'prompt', options, resolve });
    });
  }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog({ mode: 'confirm', options, resolve });
    });
  }, []);

  const handleSubmit = useCallback(() => {
    if (!dialog) return;
    if (dialog.mode === 'prompt') {
      dialog.resolve(value || null);
    } else {
      dialog.resolve(true);
    }
    setDialog(null);
    setValue('');
  }, [dialog, value]);

  const handleCancel = useCallback(() => {
    if (!dialog) return;
    if (dialog.mode === 'prompt') {
      dialog.resolve(null);
    } else {
      dialog.resolve(false);
    }
    setDialog(null);
    setValue('');
  }, [dialog]);

  return (
    <DialogContext.Provider value={{ prompt, confirm }}>
      {children}
      {dialog && (
        <div className="dialog-overlay" onClick={handleCancel}>
          <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">{dialog.mode === 'prompt' ? dialog.options.title : dialog.options.title}</div>

            {dialog.mode === 'prompt' && (
              <input
                ref={inputRef}
                className="dialog-input"
                type="text"
                value={value}
                placeholder={dialog.options.placeholder || ''}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                  if (e.key === 'Escape') handleCancel();
                }}
              />
            )}

            {dialog.mode === 'confirm' && (
              <div className="dialog-message">{dialog.options.message}</div>
            )}

            <div className="dialog-actions">
              <button className="dialog-btn cancel" onClick={handleCancel}>Cancel</button>
              <button
                ref={okRef}
                className={`dialog-btn ${dialog.mode === 'confirm' && dialog.options.danger ? 'danger' : 'ok'}`}
                onClick={handleSubmit}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') handleCancel(); }}
              >
                {dialog.mode === 'confirm' ? (dialog.options.danger ? 'Delete' : 'OK') : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
