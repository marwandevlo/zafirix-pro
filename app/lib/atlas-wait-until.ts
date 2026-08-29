import { waitUntil } from '@vercel/functions';

/** Schedule work after the HTTP response is sent (Vercel). Never throws. */
export function runAfterResponse(task: Promise<unknown>): void {
  try {
    waitUntil(task);
  } catch {
    void task;
  }
}
