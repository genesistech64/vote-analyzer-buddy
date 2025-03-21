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

// Interfaces pour les informations de député - version simplifiée pour l'UI
export interface DeputeInfo {
  id: string;
  prenom: string;
  nom: string;
  profession: string;
}

// Interface étendue pour les informations complètes du député
export interface DeputeFullInfo extends DeputeInfo {
  civilite?: string;
  date_naissance?: string;
  lieu_naissance?: string;
  groupe_politique?: string;
  organes?: OrganeInfo[];
  contacts?: ContactInfo[];
  hatvp_url?: string; // Ajout du lien vers la HATVP
}

// Nouvelle interface pour les organes (commissions, groupes, etc.)
export interface OrganeInfo {
  type: string;
  nom: string;
  date_debut: string;
  date_fin: string | null;
  legislature: string;
  uid?: string; // Ajout de l'identifiant unique de l'organe
}

// Nouvelle interface pour les députés d'un groupe
export interface DeputesParGroupe {
  organeInfo: OrganeInfo;
  deputes: DeputeInfo[];
}

// Nouvelle interface pour les contacts
export interface ContactInfo {
  type: string;
  valeur: string;
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
  id?: string;
  deputeId?: string;
  refActeur?: string;
  motif?: string;
  dateDebut?: string;
  dateFin?: string | null;
  portee?: string;
  cible?: string;
}

// Interface pour les détails d'un organe
export interface OrganeDetailInfo {
  uid: string;
  libelle: string;
  legislature: string;
  dateDebut: string;
  dateFin: string | null;
  typeOrgane: string;
  membres: Array<{
    uid: string;
    etat: string;
  }>;
}
