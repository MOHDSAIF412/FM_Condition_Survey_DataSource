import React, { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { otaStatus, subscribeOta } from '../utils/otaUpdates';

export default function AutomaticUpdates() {
  const status = useSyncExternalStore(subscribeOta, otaStatus);
  if (!Capacitor.isNativePlatform()) return null;
  return <p role="status" className="max-w-5xl mx-auto mb-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-[#293771]">{status}</p>;
}
