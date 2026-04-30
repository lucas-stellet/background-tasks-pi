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

  function flushCombined(): string[] {
    if (pending.length === 0) return [];

    const delivered = pending.map((n) => n.summary);
    const failedCount = pending.filter((n) => n.status === "failed").length;
    const completedCount = pending.filter((n) => n.status === "completed").length;
    const hasMixedTerminalStatuses = failedCount > 0 && completedCount > 0;
    const status = hasMixedTerminalStatuses
      ? "mixed"
      : failedCount > 0
        ? "failed"
        : completedCount > 0
          ? "completed"
          : pending[0]!.status;
    const countSummary = hasMixedTerminalStatuses
      ? [`${failedCount} failed, ${completedCount} completed`]
      : [];
    const content = [`🔔 Background task notifications:`, ...countSummary, ...pending.map((n) => `- ${n.summary}`)].join("\n");

    notifier.sendMessage(content, status);
    pending = [];
    return delivered;
  }

  function getPending(): Notification[] {
    return [...pending];
  }

  return { notify, flush, flushCombined, getPending };
}
