
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
  | 'error'
  | 'warning';

export interface StatusMessage {
  status: ProcessStatus;
  message: string;
  details?: string;
  fetchedCount?: number; 
  total?: number;        
}

// Interfaces pour les informations de député - version simplifiée pour l'UI
export interface DeputeInfo {
  id: string;
  prenom: string;
  nom: string;
  profession: string;
  groupe_politique?: string;
  groupe_politique_id?: string;
}

// Interface étendue pour les informations complètes du député
export interface DeputeFullInfo extends DeputeInfo {
  civilite?: string;
  date_naissance?: string;
  lieu_naissance?: string;
  groupe_politique_uid?: string; // Ajout de l'identifiant du groupe politique
  organes?: OrganeInfo[];
  contacts?: ContactInfo[];
  hatvp_url?: string; // Ajout du lien vers la HATVP
  // Raw API response fields
  etatCivil?: {
    ident?: {
      prenom?: string;
      nom?: string;
      civ?: string;
    };
    infoNaissance?: any;
  };
  mandats?: {
    mandat?: any | any[];
  };
}

// Nouvelle interface pour les organes (commissions, groupes, etc.)
export interface OrganeInfo {
  type: string;
  nom: string;
  date_debut: string;
  date_fin: string | null;
  legislature: string;
  uid?: string; // Ajout de l'identifiant unique de l'organe
  organeRef?: string; // Ajout de la référence d'organe (pour gérer les cas où uid est un ID de mandat)
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

// Interface pour les sources de données des députés
export interface DeputyDataSource {
  id: string;
  name: string;
  url: string;
  priority: number;
  status: 'active' | 'inactive' | 'failed';
  lastSync?: string;
}

// Nouvelles interfaces pour les votes des groupes
export interface GroupVoteDetail {
  scrutin?: {
    numero: string;
    dateScrutin: string;
    title: string;
    description?: string;
  };
  groupe?: {
    uid: string;
    nom: string;
    positionMajoritaire: VotePosition;
  };
  votes?: {
    pours?: { votant: any[] | any };
    contres?: { votant: any[] | any };
    abstentions?: { votant: any[] | any };
    nonVotants?: { votant: any[] | any };
  };
  nom?: string; // For compatibility with some API responses
  decompte?: {
    pour?: number | { votant: any[] | any };
    contre?: number | { votant: any[] | any };
    abstention?: number | { votant: any[] | any };
    nonVotant?: number | { votant: any[] | any };
    pours?: number | { votant: any[] | any };
    contres?: number | { votant: any[] | any };
    abstentions?: number | { votant: any[] | any };
    nonVotants?: number | { votant: any[] | any };
  };
}

export interface DeputeVoteDetail {
  id: string;
  prenom: string;
  nom: string;
  position: VotePosition;
  groupe_politique?: string;
  delegation?: boolean;
  causePosition?: string | null;
}

// Interface for organizing deputies by position of vote - DEPRECATED
// This is kept for backward compatibility but we now use DeputeVoteDetail[] instead
export interface DeputesByVotePosition {
  pours: DeputeVoteDetail[];
  contres: DeputeVoteDetail[];
  abstentions: DeputeVoteDetail[];
  nonVotants: DeputeVoteDetail[];
}

// Interface for organizing deputies by position of vote
export interface GroupeVote {
  numero: string;
  dateScrutin: string;
  title: string;
  positionMajoritaire: VotePosition;
  nombrePour: number;
  nombreContre: number;
  nombreAbstention: number;
  nombreAbsent: number;
}

// Ajout des codes couleurs pour les groupes politiques
export const groupePolitiqueCouleurs: Record<string, string> = {
  "Rassemblement National": "#1E3A8A",
  "Ensemble pour la République": "#F59E0B",
  "La France Insoumise - Nouvelle Front Populaire": "#DC2626",
  "Socialistes et apparentés": "#BE185D",
  "Droite Républicaine": "#2563EB", 
  "Écologie et Social": "#059669",
  "Les Démocrates": "#EAB308",
  "Horizons & Indépendants": "#A16207",
  "Libertés, Indépendants, Outre-Mer et Territoires": "#6B7280",
  "LIOT": "#6B7280", // Alias pour le groupe LIOT
  "Gauche Démocrate et Républicaine": "#991B1B",
  "UDI": "#3B82F6",
  "Députés non inscrits": "#111827",
  "Non inscrit": "#111827" // Alias pour les non-inscrits
};

// Récupérer la couleur d'un groupe politique (avec gestion de valeur par défaut)
export function getGroupePolitiqueCouleur(groupe?: string): string {
  if (!groupe) return "#6B7280"; // Gris par défaut si pas de groupe
  return groupePolitiqueCouleurs[groupe] || "#6B7280"; // Recherche dans le map ou gris par défaut
}
