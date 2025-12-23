
import { useState, useEffect, useCallback } from 'react';
import { Game } from '../types';
import { fetchNbaEvents } from '../api/oddsApi';
import { useApiKey } from '../context/ApiKeyContext';

export const useEvents = () => {
  const { apiKey, clearKey } = useApiKey();
  const [events, setEvents] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async (signal?: AbortSignal) => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNbaEvents(apiKey, signal);
      setEvents(data);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const message = err.message || 'Failed to fetch events';
        setError(message);
        // If the API says the key is invalid, clear it so the user can re-enter
        if (message.includes('Invalid API Key')) {
          console.warn('Invalid API Key detected, clearing...');
          clearKey();
        }
      }
    } finally {
      setLoading(false);
    }
  }, [apiKey, clearKey]);

  useEffect(() => {
    const controller = new AbortController();
    loadEvents(controller.signal);
    return () => controller.abort();
  }, [loadEvents]);

  return { events, loading, error, refresh: loadEvents };
};
