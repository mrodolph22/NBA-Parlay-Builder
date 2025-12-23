
import React, { useState, useCallback } from 'react';
import { useApiKey } from '../context/ApiKeyContext';

const ApiKeySetup: React.FC = () => {
  const [inputValue, setInputValue] = useState('');
  const { saveKey } = useApiKey();

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      saveKey(inputValue.trim());
    }
  }, [inputValue, saveKey]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '16px' }}>
      <div className="card" style={{ width: '100%', maxWidth: '380px', padding: '40px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '900', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '-1px' }}>NBA Parlay Builder</h1>
        <p style={{ fontSize: '13px', marginBottom: '32px', color: '#6b7280' }}>Enter your API key to access site.</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <input
            type="password"
            placeholder="The-Odds-API Key"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <button
            type="submit"
            className="btn-primary-gradient"
            style={{ padding: '12px', fontSize: '13px', borderRadius: '12px' }}
            disabled={!inputValue.trim()}
          >
            Access Site
          </button>
        </form>
      </div>
    </div>
  );
};

export default ApiKeySetup;
