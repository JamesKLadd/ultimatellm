/** A unit of work in a task graph. */
export interface GraphTask {
  key: string;
  dependsOn: readonly string[];
}

export type GraphStatus = 'done' | 'failed' | 'stopped' | 'skipped';

/**
 * Runs tasks as a DAG: each task starts once all of its dependencies are
 * done, with at most `concurrency` running at once. A task whose dependency
 * didn't finish is skipped. `run` must resolve (not reject) with the task's
 * status; a rejection counts as failed. After `signal` aborts, tasks that
 * haven't started are skipped.
 */
export async function runGraph<T extends GraphTask>(
  tasks: readonly T[],
  run: (task: T) => Promise<GraphStatus>,
  options: { concurrency: number; signal: AbortSignal; onSkip?: (task: T) => void },
): Promise<Map<string, GraphStatus>> {
  const status = new Map<string, GraphStatus>();
  const pending = [...tasks];
  const running = new Map<string, Promise<void>>();

  const skip = (task: T) => {
    status.set(task.key, 'skipped');
    options.onSkip?.(task);
  };

  while (pending.length > 0 || running.size > 0) {
    for (const task of [...pending]) {
      const blocked =
        options.signal.aborted ||
        task.dependsOn.some((dep) => {
          const result = status.get(dep);
          return result !== undefined && result !== 'done';
        });
      if (blocked) {
        pending.splice(pending.indexOf(task), 1);
        skip(task);
      }
    }

    for (const task of [...pending]) {
      if (running.size >= options.concurrency) break;
      if (!task.dependsOn.every((dep) => status.get(dep) === 'done')) continue;
      pending.splice(pending.indexOf(task), 1);
      running.set(
        task.key,
        run(task)
          .catch((): GraphStatus => 'failed')
          .then((result) => {
            status.set(task.key, result);
          })
          .finally(() => running.delete(task.key)),
      );
    }

    if (running.size === 0) {
      // Whatever is left waits on tasks that will never run (e.g. unknown keys).
      for (const task of pending.splice(0)) skip(task);
      break;
    }
    await Promise.race(running.values());
  }
  return status;
}
