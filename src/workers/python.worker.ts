import { expose } from 'comlink'
import { createPythonApi, guardNetwork, type NetworkScope } from '@/workers/python'

// The worker's own network APIs are wrapped before anything else runs (see python.ts).
const network = guardNetwork(self as unknown as NetworkScope)

expose(createPythonApi({ network }))
