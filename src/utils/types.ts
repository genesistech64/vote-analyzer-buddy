
export interface DeputyVoteData {
  numero: string;
  dateScrutin: string;
  title: string;
  position: VotePosition;
}

export type VotePosition = 'pour' | 'contre' | 'abstention' | 'absent';

export interface Scrutin {
  scrutin: {
    numero: string;
    dateScrutin: string;
    titre?: string;
    objet?: {
      libelle?: string;
    };
    ventilationVotes: {
      organe: {
        groupes: {
          groupe: Array<{
            vote: {
              decompteNominatif: {
                pours?: { votant?: Array<{ acteurRef: string }> };
                contres?: { votant?: Array<{ acteurRef: string }> };
                abstentions?: { votant?: Array<{ acteurRef: string }> };
                nonVotants?: { votant?: Array<{ acteurRef: string }> };
              };
            };
          }>;
        };
      };
    };
  };
}

export type ProcessStatus = 
  | 'idle' 
  | 'downloading' 
  | 'extracting' 
  | 'processing' 
  | 'complete' 
  | 'error';

export interface StatusMessage {
  status: ProcessStatus;
  message: string;
  details?: string;
}
