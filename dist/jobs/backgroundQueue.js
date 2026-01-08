"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backgroundQueue = void 0;
class BackgroundQueue {
    constructor(concurrency = 3) {
        this.running = 0;
        this.queue = [];
        this.concurrency = concurrency;
    }
    push(job) {
        this.queue.push(job);
        this.runNext();
    }
    runNext() {
        if (this.running >= this.concurrency)
            return;
        const job = this.queue.shift();
        if (!job)
            return;
        this.running++;
        job()
            .catch(() => { })
            .finally(() => {
            this.running--;
            this.runNext();
        });
    }
}
exports.backgroundQueue = new BackgroundQueue(3);
