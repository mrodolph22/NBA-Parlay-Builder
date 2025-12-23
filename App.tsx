
import React, { useState } from 'react';
import { ApiKeyProvider, useApiKey } from './context/ApiKeyContext';
import { ViewState, Game } from './types';
import ApiKeySetup from './pages/ApiKeySetup';
import Games from './pages/Games';
import GameDetail from './pages/GameDetail';

const Router: React.FC = () => {
  const { apiKey } = useApiKey();
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);

  if (!apiKey) {
    return <ApiKeySetup />;
  }

  if (selectedGame) {
    return <GameDetail game={selectedGame} onBack={() => setSelectedGame(null)} />;
  }

  return <Games onSelectGame={(game) => setSelectedGame(game)} />;
};

const App: React.FC = () => {
  return (
    <ApiKeyProvider>
      <div className="container">
        <Router />
      </div>
    </ApiKeyProvider>
  );
};

export default App;
