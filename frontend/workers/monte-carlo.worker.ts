import {
  runMonteCarloSimulation,
  type MonteCarloConfig,
  type WaterYearPattern,
  type StorageCapacityEntry,
} from '../lib/monte-carlo'

export interface WorkerRequest {
  config: MonteCarloConfig
  historicalPatterns: WaterYearPattern[]
  storageCapacity: StorageCapacityEntry[]
  ramps: Array<{ name: string; elevation: number }>
}

export interface WorkerResponse {
  type: 'result' | 'error'
  result?: any
  error?: string
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  try {
    const { config, historicalPatterns, storageCapacity, ramps } = e.data
    const result = runMonteCarloSimulation(config, historicalPatterns, storageCapacity, ramps)
    self.postMessage({ type: 'result', result } satisfies WorkerResponse)
  } catch (err: any) {
    self.postMessage({ type: 'error', error: err.message ?? 'Simulation failed' } satisfies WorkerResponse)
  }
}
