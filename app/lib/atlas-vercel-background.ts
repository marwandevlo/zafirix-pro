/** Schedule work after the HTTP response (Vercel waitUntil when available). */
export function scheduleVercelBackground(work: () => Promise<unknown>): void {
  const task = work();
  void import('@vercel/functions')
    .then(({ waitUntil }) => {
      waitUntil(task);
    })
    .catch(() => {
      void task;
    });
}
