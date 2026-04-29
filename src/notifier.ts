export interface Notification {
  summary: string;
  status: string;
}

export interface Notifier {
  isIdle: () => boolean;
  sendMessage: (content: string, status: string) => void;
}

export function createNotificationQueue(notifier: Notifier) {
  let pending: Notification[] = [];

  function notify(summary: string, status: string): void {
    pending.push({ summary, status });

    if (notifier.isIdle()) {
      const n = pending.shift();
      if (n) {
        notifier.sendMessage(`🔔 ${n.summary}`, n.status);
      }
    }
  }

  function flush(): string[] {
    const delivered: string[] = [];
    for (const n of pending) {
      notifier.sendMessage(`🔔 ${n.summary}`, n.status);
      delivered.push(n.summary);
    }
    pending = [];
    return delivered;
  }

  function getPending(): Notification[] {
    return [...pending];
  }

  return { notify, flush, getPending };
}
