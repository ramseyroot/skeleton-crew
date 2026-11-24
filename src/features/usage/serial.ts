// Runs jobs with the same key one after another inside this process. A counter update reads and then writes, so two
// at once would lose a count. This does not help across processes: a hosted app with several instances needs a
// database that can add to a number atomically (planned with the real database adapters).

const tails = new Map<string, Promise<unknown>>();

export function serialized<T>(key: string, job: () => Promise<T>): Promise<T> {
  const run = (tails.get(key) ?? Promise.resolve()).then(job, job);
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}
