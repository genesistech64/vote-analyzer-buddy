import React from 'react';
import { 
  CheckCircle2, 
  XCircle,
  CircleDashed, 
  MinusCircle, 
  InfoIcon, 
  AlignLeft,
  User
} from 'lucide-react';
import { 
  Button 
} from "@/components/ui/button";
import { Link } from 'react-router-dom';
import { formatDeputyName } from '@/utils/deputyCache';
import { DeputeVoteDetail, DeputesByVotePosition, VotePosition } from '@/utils/types';

export const positionIcons: Record<string, React.ReactNode> = {
  pour: <CheckCircle2 className="w-4 h-4 text-vote-pour" />,
  contre: <XCircle className="w-4 h-4 text-vote-contre" />,
  abstention: <MinusCircle className="w-4 h-4 text-vote-abstention" />,
  absent: <CircleDashed className="w-4 h-4 text-gray-400" />,
};

export const positionLabels: Record<string, string> = {
  pour: 'Pour',
  contre: 'Contre',
  abstention: 'Abstention',
  absent: 'Absent',
};

export const positionClasses: Record<string, string> = {
  pour: 'text-vote-pour',
  contre: 'text-vote-contre',
  abstention: 'text-vote-abstention',
  absent: 'text-gray-400',
};

export const formatDate = (dateString: string): string => {
  if (!dateString) return 'Date inconnue';
  
  try {
    const [year, month, day] = dateString.split('-').map(part => parseInt(part, 10));
    
    const date = new Date(year, month - 1, day);
    
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

export const generateAssembleeUrl = (legislature: string, scrutinNumero: string): string => {
  return `https://www.assemblee-nationale.fr/dyn/16/amendements/scrutins/${legislature}/jo${scrutinNumero}`;
};

export const getGroupName = (groupe: any): string => {
  if (typeof groupe === 'string') return groupe;
  
  if (groupe.libelle) return groupe.libelle;
  if (groupe.nom) return groupe.nom;
  if (groupe.nomComplet) return groupe.nomComplet;
  if (groupe.nomCourt) return groupe.nomCourt;
  if (groupe.organeRef) return `Groupe ${groupe.organeRef}`;
  
  return 'Groupe inconnu';
};

export const normalizePosition = (position: string): VotePosition => {
  if (!position) return 'absent';
  
  const normalized = position.toLowerCase().trim();
  
  if (normalized.includes('pour')) return 'pour';
  if (normalized.includes('contre')) return 'contre';
  if (normalized.includes('abstention')) return 'abstention';
  if (normalized.includes('non-votant') || normalized.includes('absent')) return 'absent';
  
  return 'absent';
};

export const getPositionCounts = (groupe: any): { pour: number, contre: number, abstention: number, absent: number } => {
  const counts = {
    pour: 0,
    contre: 0,
    abstention: 0,
    absent: 0
  };
  
  if (groupe.votes) {
    const votes = groupe.votes;
    
    if (votes.pours && votes.pours.votant) {
      counts.pour = Array.isArray(votes.pours.votant) ? votes.pours.votant.length : 1;
    }
    
    if (votes.contres && votes.contres.votant) {
      counts.contre = Array.isArray(votes.contres.votant) ? votes.contres.votant.length : 1;
    }
    
    if (votes.abstentions && votes.abstentions.votant) {
      counts.abstention = Array.isArray(votes.abstentions.votant) ? votes.abstentions.votant.length : 1;
    }
    
    if (votes.nonVotants && votes.nonVotants.votant) {
      counts.absent = Array.isArray(votes.nonVotants.votant) ? votes.nonVotants.votant.length : 1;
    }
  } else if (groupe.decompte) {
    const decompte = groupe.decompte;
    
    counts.pour = decompte.pour || decompte.pours || 0;
    counts.contre = decompte.contre || decompte.contres || 0;
    counts.abstention = decompte.abstention || decompte.abstentions || 0;
    counts.absent = decompte.nonVotant || decompte.nonVotants || 0;
    
    if (typeof counts.pour === 'object' && decompte.pour?.votant) {
      counts.pour = Array.isArray(decompte.pour.votant) ? decompte.pour.votant.length : 1;
    }
    if (typeof counts.contre === 'object' && decompte.contre?.votant) {
      counts.contre = Array.isArray(decompte.contre.votant) ? decompte.contre.votant.length : 1;
    }
    if (typeof counts.abstention === 'object' && decompte.abstention?.votant) {
      counts.abstention = Array.isArray(decompte.abstention.votant) ? decompte.abstention.votant.length : 1;
    }
    if (typeof counts.absent === 'object' && decompte.nonVotant?.votant) {
      counts.absent = Array.isArray(decompte.nonVotant.votant) ? decompte.nonVotant.votant.length : 1;
    }
  } else {
    counts.pour = groupe.nombrePour || groupe.nbPour || 0;
    counts.contre = groupe.nombreContre || groupe.nbContre || 0;
    counts.abstention = groupe.nombreAbstention || groupe.nbAbstention || 0;
    counts.absent = groupe.nombreNonVotant || groupe.nbNonVotant || 0;
  }
  
  return counts;
};

interface DeputyVote {
  id: string;
  prenom: string;
  nom: string;
  position: VotePosition;
  delegation?: boolean;
  causePosition?: string;
}

export const processDeputiesFromVoteDetail = (groupDetail: any): DeputeVoteDetail[] => {
  if (!groupDetail) {
    return [];
  }
  
  const deputyVotes: DeputeVoteDetail[] = [];
  
  if (groupDetail.votes) {
    if (groupDetail.votes.pours && groupDetail.votes.pours.votant) {
      const votants = Array.isArray(groupDetail.votes.pours.votant) 
        ? groupDetail.votes.pours.votant 
        : [groupDetail.votes.pours.votant];
        
      votants.forEach(votant => {
        let deputyId = '';
        
        if (typeof votant.acteurRef === 'object' && votant.acteurRef['#text']) {
          deputyId = votant.acteurRef['#text'];
        } else if (typeof votant.acteurRef === 'string') {
          deputyId = votant.acteurRef;
        } else if (votant.id) {
          deputyId = votant.id;
        }
        
        if (deputyId) {
          deputyVotes.push({
            id: deputyId,
            prenom: votant.prenom || '',
            nom: votant.nom || '',
            position: 'pour',
            delegation: votant.parDelegation === 'true' || votant.parDelegation === true,
            causePosition: votant.causePosition || null
          });
        }
      });
    }
    
    if (groupDetail.votes.contres && groupDetail.votes.contres.votant) {
      const votants = Array.isArray(groupDetail.votes.contres.votant) 
        ? groupDetail.votes.contres.votant 
        : [groupDetail.votes.contres.votant];
        
      votants.forEach(votant => {
        let deputyId = '';
        
        if (typeof votant.acteurRef === 'object' && votant.acteurRef['#text']) {
          deputyId = votant.acteurRef['#text'];
        } else if (typeof votant.acteurRef === 'string') {
          deputyId = votant.acteurRef;
        } else if (votant.id) {
          deputyId = votant.id;
        }
        
        if (deputyId) {
          deputyVotes.push({
            id: deputyId,
            prenom: votant.prenom || '',
            nom: votant.nom || '',
            position: 'contre',
            delegation: votant.parDelegation === 'true' || votant.parDelegation === true,
            causePosition: votant.causePosition || null
          });
        }
      });
    }
    
    if (groupDetail.votes.abstentions && groupDetail.votes.abstentions.votant) {
      const votants = Array.isArray(groupDetail.votes.abstentions.votant) 
        ? groupDetail.votes.abstentions.votant 
        : [groupDetail.votes.abstentions.votant];
        
      votants.forEach(votant => {
        let deputyId = '';
        
        if (typeof votant.acteurRef === 'object' && votant.acteurRef['#text']) {
          deputyId = votant.acteurRef['#text'];
        } else if (typeof votant.acteurRef === 'string') {
          deputyId = votant.acteurRef;
        } else if (votant.id) {
          deputyId = votant.id;
        }
        
        if (deputyId) {
          deputyVotes.push({
            id: deputyId,
            prenom: votant.prenom || '',
            nom: votant.nom || '',
            position: 'abstention',
            delegation: votant.parDelegation === 'true' || votant.parDelegation === true,
            causePosition: votant.causePosition || null
          });
        }
      });
    }
    
    if (groupDetail.votes.nonVotants && groupDetail.votes.nonVotants.votant) {
      const votants = Array.isArray(groupDetail.votes.nonVotants.votant) 
        ? groupDetail.votes.nonVotants.votant 
        : [groupDetail.votes.nonVotants.votant];
        
      votants.forEach(votant => {
        let deputyId = '';
        
        if (typeof votant.acteurRef === 'object' && votant.acteurRef['#text']) {
          deputyId = votant.acteurRef['#text'];
        } else if (typeof votant.acteurRef === 'string') {
          deputyId = votant.acteurRef;
        } else if (votant.id) {
          deputyId = votant.id;
        }
        
        if (deputyId) {
          deputyVotes.push({
            id: deputyId,
            prenom: votant.prenom || '',
            nom: votant.nom || '',
            position: 'absent',
            delegation: votant.parDelegation === 'true' || votant.parDelegation === true,
            causePosition: votant.causePosition || null
          });
        }
      });
    }
  }
  
  const allDeputyIds = deputyVotes.map(d => d.id).filter(id => id);
  
  if (allDeputyIds.length > 0) {
    import('@/utils/deputyCache').then(({ prefetchDeputies }) => {
      prefetchDeputies(allDeputyIds);
    });
  }
  
  return deputyVotes;
};

export const processGroupsFromVoteDetail = (voteDetails: any): Record<string, any> => {
  const groupsData: Record<string, any> = {};
  
  if (voteDetails.groupes && Array.isArray(voteDetails.groupes)) {
    console.log('Processing groups from detailed scrutin_votes_detail format');
    
    voteDetails.groupes.forEach((groupe: any) => {
      const groupeId = groupe.organeRef || groupe.uid || '';
      if (!groupeId) return;
      
      groupsData[groupeId] = groupe;
    });
    
    return groupsData;
  }
  
  if (voteDetails.scrutin && voteDetails.scrutin.ventilationVotes && voteDetails.scrutin.ventilationVotes.organe) {
    console.log('Processing groups from standard scrutin format');
    
    const organes = Array.isArray(voteDetails.scrutin.ventilationVotes.organe) 
      ? voteDetails.scrutin.ventilationVotes.organe 
      : [voteDetails.scrutin.ventilationVotes.organe];
    
    organes.forEach((organe: any) => {
      if (organe.organeRef) {
        const groupeId = typeof organe.organeRef === 'object' ? organe.organeRef['#text'] : organe.organeRef;
        
        groupsData[groupeId] = {
          ...organe,
          organeRef: groupeId,
          uid: groupeId
        };
      }
    });
    
    return groupsData;
  }
  
  if (voteDetails.scrutin && voteDetails.scrutin.groupes && voteDetails.scrutin.groupes.groupe) {
    console.log('Processing groups from scrutin.groupes.groupe format');
    
    const groupes = Array.isArray(voteDetails.scrutin.groupes.groupe) 
      ? voteDetails.scrutin.groupes.groupe 
      : [voteDetails.scrutin.groupes.groupe];
    
    groupes.forEach((groupe: any) => {
      const groupeId = groupe.organeRef || '';
      if (!groupeId) return;
      
      groupsData[groupeId] = groupe;
    });
    
    return groupsData;
  }
  
  console.log('Could not find groups in expected format');
  return {};
};
