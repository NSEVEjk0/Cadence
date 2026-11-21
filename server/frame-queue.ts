/** A small ordered queue for frames that arrive together over the network. */
export class FrameQueue<T> {
  private tail = Promise.resolve();
  private pending = 0;
  private stopped = false;

  constructor(
    private processFrame: (frame: T) => Promise<void>,
    private maximumPending = 3,
  ) {}

  enqueue(frame: T): Promise<boolean> {
    if (this.stopped || this.pending >= this.maximumPending)
      return Promise.resolve(false);
    this.pending++;
    const completed = this.tail.then(async () => {
      if (this.stopped) return false;
      try {
        await this.processFrame(frame);
        return true;
      } catch (error) {
        this.stopped = true;
        throw error;
      }
    });
    this.tail = completed.then(
      () => undefined,
      () => undefined,
    );
    return completed.finally(() => {
      this.pending--;
    });
  }

  stop(): void {
    this.stopped = true;
  }
}
