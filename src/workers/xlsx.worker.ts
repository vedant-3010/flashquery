import { expose } from 'comlink'
import { xlsxApi } from '@/workers/xlsx'

expose(xlsxApi)
