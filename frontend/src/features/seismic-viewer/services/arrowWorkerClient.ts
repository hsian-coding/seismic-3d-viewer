import type { ArrowColumnBatch } from '../workers/arrowDecode.worker'

export function decodeArrowInWorker(buffer: ArrayBuffer): Promise<ArrowColumnBatch> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/arrowDecode.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<ArrowColumnBatch>) => {
      resolve(event.data)
      worker.terminate()
    }
    worker.onerror = (event) => {
      reject(new Error(event.message || 'Arrow worker failed'))
      worker.terminate()
    }
    worker.postMessage(buffer, [buffer])
  })
}
