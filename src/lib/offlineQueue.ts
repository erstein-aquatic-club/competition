const QUEUE_KEY = "eac-offline-queue";

export type QueuedMutation = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
};

export function enqueue(type: string, payload: Record<string, unknown>) {
  const queue = getQueue();
  queue.push({ id: crypto.randomUUID(), type, payload, timestamp: Date.now() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function getQueue(): QueuedMutation[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function getQueueSize(): number {
  return getQueue().length;
}

export function saveQueue(queue: QueuedMutation[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

export function removeQueueItem(id: string) {
  const queue = getQueue().filter((item) => item.id !== id);
  saveQueue(queue);
}

export function dequeue(): QueuedMutation | undefined {
  const queue = getQueue();
  const item = queue.shift();
  saveQueue(queue);
  return item;
}
