/** Limits browser dividend requests; cancelled queued work never reaches fetch. */
export function createRequestQueue(limit: number) {
  let active = 0
  const waiting: (() => void)[] = []
  function drain() {
    while (active < limit && waiting.length) waiting.shift()!()
  }
  return function run<T>(
    task: () => Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason)
        return
      }
      function cancel() {
        const index = waiting.indexOf(start)
        if (index !== -1) waiting.splice(index, 1)
        reject(signal.reason)
      }
      function start() {
        signal.removeEventListener('abort', cancel)
        if (signal.aborted) {
          reject(signal.reason)
          return
        }
        active++
        void Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active--
            drain()
          })
      }
      signal.addEventListener('abort', cancel, { once: true })
      waiting.push(start)
      drain()
    })
  }
}
