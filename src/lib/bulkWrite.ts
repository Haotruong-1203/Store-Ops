import { writeBatch, DocumentReference } from 'firebase/firestore';
import { db } from './firebase';

export type BulkOp =
  | { type: 'set'; ref: DocumentReference; data: Record<string, any> }
  | { type: 'delete'; ref: DocumentReference };

const BATCH_SIZE = 450;
const CONCURRENCY = 6;

const stripUndefined = (value: any): any => {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      if (value[key] !== undefined) out[key] = stripUndefined(value[key]);
    }
    return out;
  }
  return value;
};

export const runBulk = async (
  ops: BulkOp[],
  onProgress?: (done: number, total: number) => void
): Promise<void> => {
  if (ops.length === 0) return;
  const chunks: BulkOp[][] = [];
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    chunks.push(ops.slice(i, i + BATCH_SIZE));
  }
  let cursor = 0;
  let done = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && cursor < chunks.length) {
      const chunk = chunks[cursor++];
      try {
        const batch = writeBatch(db);
        for (const op of chunk) {
          if (op.type === 'set') batch.set(op.ref, stripUndefined(op.data));
          else batch.delete(op.ref);
        }
        await batch.commit();
      } catch (err) {
        failed = true;
        throw err;
      }
      done += chunk.length;
      onProgress?.(done, ops.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker));
};

export const coalesce = <T>(handler: (value: T) => void, waitMs = 400) => {
  let first = true;
  let pending: T | undefined;
  let hasPending = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    timer = null;
    if (!hasPending) return;
    const value = pending as T;
    pending = undefined;
    hasPending = false;
    handler(value);
  };
  const push = (value: T) => {
    pending = value;
    hasPending = true;
    if (first) {
      first = false;
      fire();
      return;
    }
    if (timer === null) timer = setTimeout(fire, waitMs);
  };
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    hasPending = false;
  };
  return { push, cancel };
};
