
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Game, OddsResponse, Bookmaker, Market, Outcome, PrimaryPlayerProp, PlayerOffer, EventMarket } from '../types';
import { fetchAvailableMarkets, fetchOddsForMarket } from '../api/oddsApi';
import { useApiKey } from '../context/ApiKeyContext';
import { analyzeOddsWithGemini, ParlayPrediction } from '../services/geminiService';

interface GameDetailProps {
  game: Game;
  onBack: () => void;
}

const PLAYER_MARKETS = ['player_points', 'player_assists', 'player_rebounds', 'player_blocks', 'player_steals', 'player_threes'];

const GameDetail: React.FC<GameDetailProps> = ({ game, onBack }) => {
  const { apiKey, clearKey } = useApiKey();
  const [selectedMarket, setSelectedMarket] = useState<string>('player_points');
  
  const [availableMarkets, setAvailableMarkets] = useState<string[]>([]);
  const [marketCache, setMarketCache] = useState<Record<string, OddsResponse>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBookmaker, setSelectedBookmaker] = useState<string>('draftkings');
  
  const [parlay, setParlay] = useState<ParlayPrediction[] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Discovery: Load available markets on mount
  useEffect(() => {
    if (!apiKey) return;
    const controller = new AbortController();
    setLoading(true);
    fetchAvailableMarkets(apiKey, game.id, controller.signal)
      .then(markets => {
        const playerKeys = markets.map(m => m.key).filter(k => k.startsWith('player_'));
        setAvailableMarkets(playerKeys);
        setLoading(false);
        if (playerKeys.length === 0) setAvailableMarkets(PLAYER_MARKETS);
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          setAvailableMarkets(PLAYER_MARKETS);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [game.id, apiKey]);

  // Lazy Loading: Market odds
  useEffect(() => {
    if (!apiKey || !selectedMarket || marketCache[selectedMarket] || !availableMarkets.includes(selectedMarket)) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchOddsForMarket(apiKey, game.id, selectedMarket, controller.signal)
      .then(data => {
        setMarketCache(prev => ({ ...prev, [selectedMarket]: data }));
        setLoading(false);
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          setError(`Market not available: ${selectedMarket}`);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [selectedMarket, availableMarkets, apiKey, game.id, marketCache]);

  useEffect(() => {
    setParlay(null);
  }, [selectedMarket, selectedBookmaker]);

  const primaryProps = useMemo<PrimaryPlayerProp[]>(() => {
    const data = marketCache[selectedMarket];
    if (!data) return [];

    const rawDataMap: Record<string, Record<number, PlayerOffer[]>> = {};
    data.bookmakers.forEach((bookie) => {
      bookie.markets.forEach((market) => {
        market.outcomes.forEach((outcome) => {
          const playerName = outcome.description || 'Unknown';
          const line = outcome.point ?? 0;
          const key = `${playerName}|${market.key}`;
          if (!rawDataMap[key]) rawDataMap[key] = {};
          if (!rawDataMap[key][line]) rawDataMap[key][line] = [];
          const existing = rawDataMap[key][line].find(o => o.bookmaker === bookie.key);
          if (existing) {
            if (outcome.name === 'Over') existing.overPrice = outcome.price;
            if (outcome.name === 'Under') existing.underPrice = outcome.price;
          } else {
            rawDataMap[key][line].push({
              bookmaker: bookie.key,
              bookmakerTitle: bookie.title,
              overPrice: outcome.name === 'Over' ? outcome.price : undefined,
              underPrice: outcome.name === 'Under' ? outcome.price : undefined,
            });
          }
        });
      });
    });

    const results: PrimaryPlayerProp[] = [];
    Object.keys(rawDataMap).forEach(key => {
      const lines = Object.keys(rawDataMap[key]).map(Number);
      let primaryLine = lines[0];
      let maxCount = -1;
      lines.forEach(line => {
        const count = rawDataMap[key][line].filter(o => o.overPrice && o.underPrice).length;
        if (count > maxCount) { maxCount = count; primaryLine = line; }
      });
      const [playerName, marketKey] = key.split('|');
      results.push({ playerName, marketKey, line: primaryLine, offers: rawDataMap[key][primaryLine] });
    });
    return results.sort((a, b) => a.playerName.localeCompare(b.playerName));
  }, [marketCache, selectedMarket]);

  const currentBookmakers = useMemo(() => {
    const data = marketCache[selectedMarket];
    return data ? data.bookmakers.map(b => ({ key: b.key, title: b.title })) : [];
  }, [marketCache, selectedMarket]);

  const handleAnalyze = useCallback(async () => {
    const currentData = marketCache[selectedMarket];
    if (!currentData) return;
    setAnalyzing(true);
    const bookieTitle = currentBookmakers.find(b => b.key === selectedBookmaker)?.title || selectedBookmaker;
    const result = await analyzeOddsWithGemini(selectedMarket, bookieTitle, primaryProps);
    setParlay(result);
    setAnalyzing(false);
  }, [marketCache, selectedMarket, primaryProps, selectedBookmaker, currentBookmakers]);

  const renderMarketLabel = (key: string) => key.replace('player_', '').replace('_', ' ').toUpperCase();
  
  const renderMarketLabelClean = (key: string) => {
    const words = key.replace('player_', '').split('_');
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', paddingBottom: '60px' }}>
      <header>
        <button onClick={onBack}>Back</button>
        <h1 style={{ margin: 0, fontSize: '14px', fontWeight: '900', textTransform: 'uppercase', flex: 1, textAlign: 'center' }}>
          {game.away_team} <span style={{ color: '#9ca3af' }}>@</span> {game.home_team}
        </h1>
        <button onClick={clearKey} style={{ border: 'none', color: '#9ca3af', boxShadow: 'none' }}>Logout</button>
      </header>

      <main>
        {/* Lightweight Market Selector Tabs */}
        <div className="tab-container">
          {availableMarkets.map(m => (
            <button 
              key={m} 
              onClick={() => setSelectedMarket(m)}
              className={`tab-item ${selectedMarket === m ? 'active' : ''}`}
            >
              {renderMarketLabelClean(m)}
            </button>
          ))}
        </div>

        {loading && <div className="label-tiny" style={{ marginBottom: '20px', textAlign: 'center' }}>Fetching Feed...</div>}
        {error && <div className="label-tiny" style={{ color: '#dc2626', marginBottom: '20px', textAlign: 'center' }}>{error}</div>}

        {!loading && marketCache[selectedMarket] && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {/* Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className="label-tiny">Sportsbook</span>
                <select value={selectedBookmaker} onChange={(e) => setSelectedBookmaker(e.target.value)}>
                  {currentBookmakers.map(b => <option key={b.key} value={b.key}>{b.title}</option>)}
                </select>
              </div>
              <button 
                onClick={handleAnalyze} 
                disabled={analyzing} 
                style={{ backgroundColor: '#000', color: '#fff', padding: '10px 20px', borderRadius: '30px' }}
              >
                {analyzing ? 'Building Parlay' : 'Build Parlay'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {primaryProps.length === 0 ? (
                <div className="no-line" style={{ textAlign: 'center', padding: '40px' }}>No player props found for this market.</div>
              ) : (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr', 
                  gap: '20px' 
                }}>
                  {primaryProps.map(prop => {
                    const offer = prop.offers.find(o => o.bookmaker === selectedBookmaker);
                    const prediction = parlay?.find(p => p.playerName === prop.playerName);

                    return (
                      <div key={prop.playerName} className="card player-group">
                        <div className="player-header" style={{ textAlign: 'center' }}>{prop.playerName}</div>
                        
                        <div className="prop-body">
                          {prediction ? (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, alignItems: 'center', textAlign: 'center' }}>
                                <div className={`prediction-badge ${prediction.prediction === 'MORE' ? 'prediction-more' : 'prediction-less'}`}>
                                  {prediction.prediction}
                                </div>
                                <span className="prop-line">{prop.line}</span>
                                <span className="prop-label">{renderMarketLabel(prop.marketKey)}</span>
                              </div>
                              <div className="parlay-reason" style={{ flex: 1, textAlign: 'left', paddingLeft: '12px', borderLeft: '1px solid var(--border-color)', borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
                                {prediction.reason}
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px' }}>
                              {/* Prop block: Stacked and centered internally */}
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                <span className="prop-line">{prop.line}</span>
                                <span className="prop-label">{renderMarketLabel(prop.marketKey)}</span>
                              </div>
                              
                              {/* Odds block: Vertically centered relative to the container */}
                              <div className="odds-container" style={{ alignSelf: 'center' }}>
                                {offer ? (
                                  <>
                                    <div className="odds-column" style={{ justifyContent: 'center' }}>
                                      <span className="label-tiny">OVER</span>
                                      <span className="odds-value">{offer.overPrice}</span>
                                    </div>
                                    <div className="odds-column" style={{ justifyContent: 'center' }}>
                                      <span className="label-tiny">UNDER</span>
                                      <span className="odds-value">{offer.underPrice}</span>
                                    </div>
                                  </>
                                ) : (
                                  <div className="no-line">no line</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default GameDetail;
