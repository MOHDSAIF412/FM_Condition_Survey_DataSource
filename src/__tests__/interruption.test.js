import { beforeEach, expect, test, vi } from 'vitest';
import { markRecordInterrupted, clearRecordInterrupted, consumeRecordInterrupted } from '../utils/interruption';
import { selectDeviceAccount } from '../utils/deviceAccount';

beforeEach(() => {
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
  });
  selectDeviceAccount('surveyor-a');
});

test('a record left open when the app was ended is reopened once', () => {
  markRecordInterrupted('facility-1', 'items');
  expect(consumeRecordInterrupted()).toEqual({ surveyId: 'facility-1', tab: 'items' });
  expect(consumeRecordInterrupted()).toBeNull();
});

test('returning to the app normally means nothing to restore', () => {
  markRecordInterrupted('facility-1', 'items');
  clearRecordInterrupted();
  expect(consumeRecordInterrupted()).toBeNull();
});

test('an old note does not hijack a later launch', () => {
  markRecordInterrupted('facility-1', 'facility');
  expect(consumeRecordInterrupted(Date.now() + 3 * 60 * 60 * 1000)).toBeNull();
});

test('another account on the same phone is not taken into the record', () => {
  markRecordInterrupted('facility-1', 'facility');
  selectDeviceAccount('surveyor-b');
  expect(consumeRecordInterrupted()).toBeNull();
});
