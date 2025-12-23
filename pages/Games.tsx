
import React from 'react';
import { useEvents } from '../hooks/useEvents';
import { useApiKey } from '../context/ApiKeyContext';
import { Game } from '../types';

interface GamesProps {
  onSelectGame: (game: Game) => void;
}

const Games: React.FC<GamesProps> = ({ onSelectGame }) => {
  const { events, loading, error, refresh } = useEvents();
  const { clearKey } = useApiKey();

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <div className="label-tiny">Scanning NBA Schedule...</div>
    </div>
  );
  
  if (error) {
    const isInvalidKey = error.toLowerCase().includes('api key');
    return (
      <div style={{ padding: '40px' }}>
        <div className="card" style={{ padding: '24px', borderLeft: '4px solid #dc2626' }}>
          <div style={{ color: '#dc2626', textTransform: 'uppercase', fontSize: '11px', fontWeight: 'bold', marginBottom: '16px' }}>
            Data Request Failed
          </div>
          <p style={{ fontSize: '13px', marginBottom: '16px' }}>{error}</p>
          <div style={{ display: 'flex', gap: '12px' }}>
             <button onClick={() => refresh()}>Retry</button>
            {isInvalidKey && (
              <button 
                onClick={clearKey}
                style={{ backgroundColor: '#000', color: '#fff' }}
              >
                Reset API Key
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <header>
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>Schedule</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => refresh()}>Refresh</button>
          <button onClick={clearKey} style={{ color: '#9ca3af', border: 'none', boxShadow: 'none' }}>Logout</button>
        </div>
      </header>
      <main style={{ paddingBottom: '40px' }}>
        {events.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280', textTransform: 'uppercase', fontSize: '11px', fontWeight: 800 }}>No upcoming games.</div>
        ) : (
          events.map((game) => (
            <div
              key={game.id}
              onClick={() => onSelectGame(game)}
              className="card game-item"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '15px', fontWeight: '800', textTransform: 'uppercase' }}>
                <span>{game.away_team} <span style={{ color: '#9ca3af', fontWeight: 400 }}>@</span> {game.home_team}</span>
              </div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {new Date(game.commence_time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
};

export default Games;
