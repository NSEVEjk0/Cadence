import { describe, expect, it } from "vitest";
import { FrameQueue } from "../../server/frame-queue";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("camera frame queue", () => {
  it("processes a burst in capture order while the first decode is pending", async () => {
    const decode = gate();
    const processed: number[] = [];
    const queue = new FrameQueue<number>(async (frame) => {
      processed.push(frame);
      if (frame === 1) await decode.promise;
    });
    const completions = [1, 2, 3].map((frame) => queue.enqueue(frame));
    await Promise.resolve();
    expect(processed).toEqual([1]);
    decode.release();
    expect(await Promise.all(completions)).toEqual([true, true, true]);
    expect(processed).toEqual([1, 2, 3]);
  });

  it("bounds waiting work including the active frame and frees capacity after processing", async () => {
    const decode = gate();
    const processed: number[] = [];
    const queue = new FrameQueue<number>(async (frame) => {
      processed.push(frame);
      if (frame === 1) await decode.promise;
    });
    const completions = [1, 2, 3].map((frame) => queue.enqueue(frame));
    expect(await queue.enqueue(4)).toBe(false);
    decode.release();
    await Promise.all(completions);
    expect(await queue.enqueue(5)).toBe(true);
    expect(processed).toEqual([1, 2, 3, 5]);
  });

  it("does not process waiting or new frames after stopping", async () => {
    const decode = gate();
    const processed: number[] = [];
    const queue = new FrameQueue<number>(async (frame) => {
      processed.push(frame);
      await decode.promise;
    });
    const completions = [1, 2, 3].map((frame) => queue.enqueue(frame));
    await Promise.resolve();
    queue.stop();
    expect(await queue.enqueue(4)).toBe(false);
    decode.release();
    expect(await Promise.all(completions)).toEqual([true, false, false]);
    expect(processed).toEqual([1]);
  });

  it("stops waiting frames after a decoder failure", async () => {
    const processed: number[] = [];
    const queue = new FrameQueue<number>(async (frame) => {
      processed.push(frame);
      throw new Error("Invalid JPEG");
    });
    const first = queue.enqueue(1);
    const second = queue.enqueue(2);
    await expect(first).rejects.toThrow("Invalid JPEG");
    expect(await second).toBe(false);
    expect(await queue.enqueue(3)).toBe(false);
    expect(processed).toEqual([1]);
  });
});
