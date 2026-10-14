export function checkReportCancelled(signal) {
  if (signal?.aborted) throw new DOMException('Report generation cancelled.', 'AbortError');
}
export const yieldToScreen = () => new Promise(resolve => setTimeout(resolve, 0));
