
export interface DeputyVoteData {
  numero: string;
  dateScrutin: string;
  title: string;
  position: VotePosition;
}

// Types de positions de vote (en minuscules pour la cohérence interne)
export type VotePosition = 'pour' | 'contre' | 'abstention' | 'absent';

// Type de la réponse de l'API (avec les champs exacts de l'API)
export interface ApiVoteResponse {
  numero: string;
  date: string;   // L'API utilise "date" au lieu de "dateScrutin"
  titre: string;  // L'API utilise "titre" au lieu de "title"
  position: string; // L'API renvoie "Pour", "Contre", "Abstention", "Absent" avec majuscules
}

export type ProcessStatus = 
  | 'idle' 
  | 'loading'
  | 'complete' 
  | 'error';

export interface StatusMessage {
  status: ProcessStatus;
  message: string;
  details?: string;
}

// Nouvelles interfaces pour les informations de député
export interface DeputeInfo {
  id: string;
  prenom: string;
  nom: string;
  profession: string;
}

// Interface pour les résultats de recherche de député
export interface DeputeSearchResult {
  success: boolean;
  deputeInfo?: DeputeInfo;
  multipleResults?: boolean;
  options?: Array<{
    id: string;
    prenom: string;
    nom: string;
  }>;
}

// Interface pour les déports (restrictions de vote)
export interface DeportInfo {
  id: string;
  deputeId: string;
  portee: string;
  cible: string;
}
