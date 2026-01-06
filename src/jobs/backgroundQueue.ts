type JobFn = () => Promise<void>;

class BackgroundQueue {
  private concurrency: number;
  private running = 0;
  private queue: JobFn[] = [];

  constructor(concurrency = 3) {
    this.concurrency = concurrency;
  }

  push(job: JobFn) {
    this.queue.push(job);
    this.runNext();
  }

  private runNext() {
    if (this.running >= this.concurrency) return;
    const job = this.queue.shift();
    if (!job) return;
    this.running++;
    job()
      .catch(() => {})
      .finally(() => {
        this.running--;
        this.runNext();
      });
  }
}

export const backgroundQueue = new BackgroundQueue(3);
