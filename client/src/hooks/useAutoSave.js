import { useEffect, useRef, useState, useCallback } from 'react';
import { getToken } from '../lib/api';

const SERVER_URL = (window.location.port && !['80','443',''].includes(window.location.port)) ? `http://${window.location.hostname}:4444` : '';

export function useAutoSave({ caseId, getState, enabled = true, debounceMs = 1000, periodicMs = 30000 }) {
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error
  const lastHashRef = useRef('');
  const timerRef = useRef(null);
  const initLoadedRef = useRef(false);

  const computeHash = useCallback(() => {
    const s = getState();
    return JSON.stringify({
      e: s.entities?.map(e => `${e.id}:${e.x}:${e.y}:${e.label}`),
      l: s.links?.length,
      s: s.stickers?.length,
      p: s.postits?.length,
    });
  }, [getState]);

  const doSave = useCallback(async () => {
    if (!caseId || !enabled || !initLoadedRef.current) return;
    const hash = computeHash();
    if (hash === lastHashRef.current) return;

    setStatus('saving');
    try {
      const token = getToken();
      const state = getState();
      const res = await fetch(`${SERVER_URL}/api/save/${encodeURIComponent(caseId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          entities: state.entities, links: state.links,
          stickers: state.stickers, postits: state.postits,
          caseInfo: state.caseInfo,
        }),
      });
      if (res.ok) {
        lastHashRef.current = hash;
        setStatus('saved');
        setTimeout(() => setStatus(s => s === 'saved' ? 'idle' : s), 2000);
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }, [caseId, enabled, computeHash, getState]);

  // Mark as loaded after first render (prevents saving empty state on F5)
  const markLoaded = useCallback(() => { initLoadedRef.current = true; }, []);

  // Debounced save on state change
  useEffect(() => {
    if (!enabled || !initLoadedRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(doSave, debounceMs);
    return () => clearTimeout(timerRef.current);
  });

  // Periodic save
  useEffect(() => {
    if (!enabled) return;
    const iv = setInterval(doSave, periodicMs);
    return () => clearInterval(iv);
  }, [enabled, doSave, periodicMs]);

  return { status, save: doSave, markLoaded };
}
