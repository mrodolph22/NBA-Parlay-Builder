
export interface Game {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
}

export interface EventMarket {
  key: string;
  group: string;
}

export interface Outcome {
  name: string;
  description?: string; // Player name often lives here
  price: number;
  point?: number;
}

export interface Market {
  key: string;
  last_update: string;
  outcomes: Outcome[];
}

export interface Bookmaker {
  key: string;
  title: string;
  markets: Market[];
}

export interface OddsResponse {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
}

export interface PlayerOffer {
  bookmaker: string;
  bookmakerTitle: string;
  overPrice?: number;
  underPrice?: number;
}

export interface PrimaryPlayerProp {
  playerName: string;
  marketKey: string;
  line: number;
  offers: PlayerOffer[];
}

export enum ViewState {
  API_SETUP = 'api_setup',
  GAMES_LIST = 'games_list',
  GAME_DETAIL = 'game_detail'
}
