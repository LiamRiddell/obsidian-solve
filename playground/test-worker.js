// Test script for DataQueryWorker in playground
import { dataQueryWorker } from './playground/src/data-query.worker.ts';

// Test currency query
const testRequest = {
  id: 'test-1',
  dataSourceId: 'currency',
  queryKey: ['currency', 'USD', 'EUR'],
  timestamp: Date.now(),
};

console.log('Testing DataQueryWorker...');
console.log('Request:', testRequest);

// Simulate worker message handling
dataQueryWorker.handleMessage({
  data: {
    type: 'FETCH_REQUEST',
    payload: testRequest,
  },
} as any);