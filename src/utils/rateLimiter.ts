export async function withBackoff<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  let attempt = 0;
  let wait = 500;
  while (true) {
    try {
      return await fn();
    } catch (e: any) {
      attempt++;
      if (attempt > maxRetries) throw e;
      await new Promise(res => setTimeout(res, wait));
      wait = Math.min(wait * 2, 5000);
    }
  }
}