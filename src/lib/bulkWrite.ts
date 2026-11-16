export type BulkOp =
  | { type: 'set'; table: string; data: Record<string, any> }
  | { type: 'delete'; table: string; id: string };

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
