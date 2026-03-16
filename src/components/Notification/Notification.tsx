/**
 * Notification — toast notification system.
 */

import { useState, useCallback, createContext, useContext, type ReactNode } from 'react';

export type NotificationType = 'info' | 'success' | 'error';

interface Notification {
  id: number;
  message: string;
  type: NotificationType;
  fading: boolean;
}

interface NotificationContextValue {
  notify: (message: string, type?: NotificationType) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

let nextId = 0;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const notify = useCallback((message: string, type: NotificationType = 'info') => {
    const id = nextId++;
    setNotifications((prev) => [...prev, { id, message, type, fading: false }]);

    // Start fade out after 3s
    setTimeout(() => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, fading: true } : n))
      );
    }, 3000);

    // Remove after fade animation
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 3300);
  }, []);

  const iconMap: Record<NotificationType, string> = {
    info: 'codicon-info',
    success: 'codicon-check',
    error: 'codicon-error',
  };

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <div id="notification-container">
        {notifications.map((n) => (
          <div key={n.id} className={`notification ${n.type}${n.fading ? ' fadeout' : ''}`}>
            <span className={`codicon ${iconMap[n.type]}`} />
            {n.message}
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider');
  return ctx;
}
