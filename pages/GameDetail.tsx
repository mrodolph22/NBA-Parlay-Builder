
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Game, OddsResponse, Bookmaker, Market, Outcome, PrimaryPlayerProp, PlayerOffer, EventMarket } from '../types';
import { fetchAvailableMarkets, fetchOddsForMarket } from '../api/oddsApi';
import { useApiKey } from '../context/ApiKeyContext';
import { generateInsightsWithGemini, PlayerInsight } from '../services/geminiService';
import { calculateEMR } from '../utils/emrCalculator';
import { evaluateParlayRole } from '../utils/parlayFit';

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
  
  const [insights, setInsights] = useState<PlayerInsight[] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

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
    setInsights(null);
  }, [selectedMarket, selectedBookmaker]);

  const primaryProps = useMemo<PrimaryPlayerProp[]>(() => {
    const data = marketCache[selectedMarket];
    if (!data) return [];

    const rawDataMap: Record<string, { team?: string; lines: Record<number, PlayerOffer[]> }> = {};
    data.bookmakers.forEach((bookie) => {
      bookie.markets.forEach((market) => {
        market.outcomes.forEach((outcome) => {
          const playerName = outcome.description || 'Unknown';
          const line = outcome.point ?? 0;
          const key = `${playerName}|${market.key}`;
          
          if (!rawDataMap[key]) {
            rawDataMap[key] = { team: outcome.team, lines: {} };
          }
          if (!rawDataMap[key].lines[line]) {
            rawDataMap[key].lines[line] = [];
          }
          
          const existing = rawDataMap[key].lines[line].find(o => o.bookmaker === bookie.key);
          if (existing) {
            if (outcome.name === 'Over') existing.overPrice = outcome.price;
            if (outcome.name === 'Under') existing.underPrice = outcome.price;
          } else {
            rawDataMap[key].lines[line].push({
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
      const { team, lines: linesMap } = rawDataMap[key];
      const lines = Object.keys(linesMap).map(Number);
      let primaryLine = lines[0];
      let maxCount = -1;
      lines.forEach(line => {
        const count = linesMap[line].filter(o => o.overPrice && o.underPrice).length;
        if (count > maxCount) { maxCount = count; primaryLine = line; }
      });
      const [playerName, marketKey] = key.split('|');
      
      const offersAtPrimary = linesMap[primaryLine];
      
      let consensusStrength: 'Low' | 'Medium' | 'High' = 'Low';
      const bookCount = offersAtPrimary.length;
      let avgOverPrice = -110;
      let avgUnderPrice = -110;
      let marketLean: 'MORE' | 'LESS' | undefined = undefined;
      
      if (bookCount >= 1) {
        const overPrices = offersAtPrimary.map(o => o.overPrice).filter((p): p is number => p !== undefined);
        const underPrices = offersAtPrimary.map(o => o.underPrice).filter((p): p is number => p !== undefined);
        
        if (overPrices.length > 0 && underPrices.length > 0) {
          avgOverPrice = overPrices.reduce((a, b) => a + b, 0) / overPrices.length;
          avgUnderPrice = underPrices.reduce((a, b) => a + b, 0) / underPrices.length;
          marketLean = avgOverPrice < avgUnderPrice ? 'MORE' : 'LESS';
        }

        if (bookCount >= 2) {
          const overFavoredCount = overPrices.filter(p => p < 0).length;
          const underFavoredCount = underPrices.filter(p => p < 0).length;
          const juiceAligned = overFavoredCount === overPrices.length || underFavoredCount === overPrices.length;

          if (bookCount >= 3) {
            consensusStrength = juiceAligned ? 'High' : 'Medium';
          } else {
            consensusStrength = 'Medium';
          }
        }
      }

      const parlayRole = evaluateParlayRole(primaryLine, marketKey, consensusStrength, avgOverPrice);

      results.push({ 
        playerName, 
        marketKey, 
        line: primaryLine, 
        team,
        offers: offersAtPrimary,
        consensusStrength,
        parlayRole,
        marketLean
      });
    });

    // --- STRUCTURAL NOTABLE SELECTION LOGIC ---
    const eligible = results.filter(p => {
      const offer = p.offers.find(o => o.bookmaker === selectedBookmaker);
      const pricingAvailable = offer && offer.overPrice !== undefined && offer.underPrice !== undefined;
      return p.marketLean !== undefined && pricingAvailable;
    });

    const getStabilityScore = (p: PrimaryPlayerProp) => {
      const emr = calculateEMR(p, selectedBookmaker).value;
      const isHook = p.line % 1 !== 0;
      return emr + (isHook ? 5 : 0);
    };

    const sortedAnchors = eligible.filter(p => p.parlayRole === 'Anchor').sort((a, b) => getStabilityScore(a) - getStabilityScore(b)).slice(0, 2);
    const sortedSupport = eligible.filter(p => p.parlayRole === 'Support').sort((a, b) => getStabilityScore(a) - getStabilityScore(b)).slice(0, 2);
    const sortedVolatile = eligible.filter(p => p.parlayRole === 'Volatile').sort((a, b) => getStabilityScore(a) - getStabilityScore(b)).slice(0, 2);

    const notablePlayers = new Set([...sortedAnchors, ...sortedSupport, ...sortedVolatile].map(p => p.playerName));

    results.forEach(p => {
      if (notablePlayers.has(p.playerName)) {
        p.isNotable = true;
      }
    });

    return results.sort((a, b) => a.playerName.localeCompare(b.playerName));
  }, [marketCache, selectedMarket, selectedBookmaker]);

  const { awayPlayers, homePlayers } = useMemo(() => {
    const away: PrimaryPlayerProp[] = [];
    const home: PrimaryPlayerProp[] = [];

    primaryProps.forEach(prop => {
      if (prop.team === game.home_team) {
        home.push(prop);
      } else if (prop.team === game.away_team) {
        away.push(prop);
      } else {
        if (away.length <= home.length) away.push(prop);
        else home.push(prop);
      }
    });

    return { awayPlayers: away, homePlayers: home };
  }, [primaryProps, game]);

  const currentBookmakers = useMemo(() => {
    const data = marketCache[selectedMarket];
    return data ? data.bookmakers.map(b => ({ key: b.key, title: b.title })) : [];
  }, [marketCache, selectedMarket]);

  const handleGenerateInsights = useCallback(async () => {
    const currentData = marketCache[selectedMarket];
    if (!currentData) return;
    setAnalyzing(true);
    
    const context = primaryProps.map(p => ({
      name: p.playerName,
      team: p.team,
      line: p.line,
      lean: p.marketLean || 'NEUTRAL',
      consensus: p.consensusStrength,
      role: p.parlayRole,
      offers: p.offers.map(o => ({ b: o.bookmaker, o: o.overPrice, u: o.underPrice }))
    }));

    const result = await generateInsightsWithGemini(selectedMarket, context);
    setInsights(result);
    setAnalyzing(false);
  }, [marketCache, selectedMarket, primaryProps]);

  const renderMarketLabel = (key: string) => key.replace('player_', '').replace('_', ' ').toUpperCase();
  const renderMarketLabelClean = (key: string) => {
    const words = key.replace('player_', '').split('_');
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const formatRiskLevel = (level: string) => {
    return level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();
  };

  const renderPlayerCard = (prop: PrimaryPlayerProp) => {
    const offer = prop.offers.find(o => o.bookmaker === selectedBookmaker);
    const playerInsight = insights?.find(i => i.playerName === prop.playerName);
    const emr = calculateEMR(prop, selectedBookmaker);
    
    const riskClass = 
      emr.level === 'Lower Miss Risk' ? 'risk-lower' : 
      emr.level === 'Moderate Miss Risk' ? 'risk-moderate' : 
      emr.level === 'Elevated Miss Risk' ? 'risk-elevated' : 'risk-high';

    const favoredPrice = prop.marketLean === 'MORE' ? offer?.overPrice : offer?.underPrice;
    const showAdvancedData = !!insights;

    return (
      <div key={prop.playerName} className="card player-group">
        <div className="player-header">
          <span>{prop.playerName}</span>
          <div style={{ float: 'right', display: 'flex', alignItems: 'center' }}>
            {prop.isNotable && showAdvancedData && (
              <span className="star-indicator" aria-label="Role stability and market consistency indicator">★</span>
            )}
            <span style={{ opacity: 0.5, fontSize: '8.5px', fontWeight: 600 }}>{prop.team}</span>
          </div>
        </div>
        
        <div className="prop-body">
          <span className="prop-line">{prop.line}</span>
          <span className="prop-label">{renderMarketLabel(prop.marketKey)}</span>

          <div className="market-section">
            {!showAdvancedData ? (
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                {offer && offer.overPrice !== undefined && offer.underPrice !== undefined ? (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span className="label-tiny" style={{ marginBottom: '2px' }}>OVER</span>
                      <span className="odds-value">{offer.overPrice}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span className="label-tiny" style={{ marginBottom: '2px' }}>UNDER</span>
                      <span className="odds-value">{offer.underPrice}</span>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '7.5px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Market unavailable</div>
                )}
              </div>
            ) : (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 4px' }}>
                {prop.marketLean && favoredPrice !== undefined ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span className={`prediction-badge ${prop.marketLean === 'MORE' ? 'prediction-more' : 'prediction-less'}`} style={{ width: '42px', textAlign: 'center' }}>
                      {prop.marketLean}
                    </span>
                    <span className="odds-value" style={{ fontWeight: '900', fontSize: '11px', color: prop.marketLean === 'MORE' ? 'var(--more-color)' : 'var(--less-color)' }}>
                      {favoredPrice}
                    </span>
                  </div>
                ) : (
                  <div style={{ fontSize: '8px', color: '#9ca3af', fontWeight: 800, marginBottom: '4px', textTransform: 'uppercase' }}>
                    Market unavailable
                  </div>
                )}
                {playerInsight && (
                  <div style={{ fontSize: '7.5px', color: '#4b5563', lineHeight: 1.2, fontWeight: 500, maxWidth: '100%' }}>
                    {playerInsight.insight}
                  </div>
                )}
              </div>
            )}
          </div>

          {showAdvancedData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '4px' }}>
              <div 
                className="consensus-indicator" 
                style={{ 
                  fontSize: '8px', 
                  color: '#9ca3af', 
                  fontWeight: 700, 
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px'
                }}
              >
                Consensus: {prop.consensusStrength}
              </div>
              <div 
                className="parlay-role-label"
                style={{ 
                  fontSize: '8px', 
                  color: '#9ca3af', 
                  fontWeight: 800, 
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                  opacity: 0.8
                }}
              >
                Role: {prop.parlayRole}
              </div>
            </div>
          )}

          {showAdvancedData && (
            <div className="emr-row">
              {offer && offer.overPrice !== undefined ? (
                <span className={`risk-tag ${riskClass}`}>
                  {formatRiskLevel(emr.level)} ({emr.value}%)
                </span>
              ) : (
                <span className="risk-tag risk-disabled">No Context</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', paddingBottom: '32px' }}>
      <header>
        <button onClick={onBack}>Back</button>
        <h1 style={{ margin: 0, fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', flex: 1, textAlign: 'center' }}>
          {game.away_team} <span style={{ color: '#9ca3af' }}>@</span> {game.home_team}
        </h1>
        <button onClick={clearKey} style={{ border: 'none', color: '#9ca3af', boxShadow: 'none' }}>Logout</button>
      </header>

      <main>
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

        {!loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span className="label-tiny">Sportsbook</span>
                <select value={selectedBookmaker} onChange={(e) => setSelectedBookmaker(e.target.value)}>
                  {currentBookmakers.map(b => <option key={b.key} value={b.key}>{b.title}</option>)}
                </select>
              </div>
              <button 
                onClick={handleGenerateInsights} 
                disabled={analyzing} 
                className={analyzing ? "" : "btn-primary-gradient"}
                style={{ fontSize: '9px', padding: '8px 16px' }}
              >
                {analyzing ? 'Analyzing Structure...' : 'Generate Insights'}
              </button>
            </div>

            {loading && <div className="label-tiny" style={{ textAlign: 'center' }}>Updating Feed...</div>}
            {error && <div className="label-tiny" style={{ color: '#dc2626', textAlign: 'center' }}>{error}</div>}

            <div className="team-group-grid">
              <div className="team-column">
                {awayPlayers.length === 0 && !loading && (
                   <div className="label-tiny" style={{ textAlign: 'center', padding: '10px' }}>No lines</div>
                )}
                {awayPlayers.map(renderPlayerCard)}
              </div>

              <div className="team-column">
                {homePlayers.length === 0 && !loading && (
                   <div className="label-tiny" style={{ textAlign: 'center', padding: '10px' }}>No lines</div>
                )}
                {homePlayers.map(renderPlayerCard)}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default GameDetail;
