
import { GroupVoteDetail, VotePosition } from '@/utils/types';
import { CheckCircle2, XCircle, Minus, Clock } from 'lucide-react';

export const formatDate = (dateString: string) => {
  if (!dateString) return '';
  
  try {
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  } catch (e) {
    return dateString;
  }
};

export const positionIcons: Record<string, JSX.Element> = {
  'pour': <CheckCircle2 className="h-5 w-5 text-vote-pour" />,
  'contre': <XCircle className="h-5 w-5 text-vote-contre" />,
  'abstention': <Minus className="h-5 w-5 text-vote-abstention" />,
  'absent': <Clock className="h-5 w-5 text-vote-absent" />
};

export const positionLabels: Record<string, string> = {
  'pour': 'Pour',
  'contre': 'Contre',
  'abstention': 'Abstention',
  'absent': 'Absent'
};

export const positionClasses: Record<string, string> = {
  'pour': 'text-vote-pour',
  'contre': 'text-vote-contre',
  'abstention': 'text-vote-abstention',
  'absent': 'text-vote-absent'
};

// Helper function to safely handle array length count from API responses
export const countVotants = (data: any): number => {
  if (!data) return 0;
  if (!data.votant) return 0;
  
  // Handle different API response formats (single object vs array)
  if (Array.isArray(data.votant)) {
    return data.votant.length;
  } else if (typeof data.votant === 'object') {
    return 1; // Single deputy
  }
  
  return 0;
};

// Get vote counts for a group from API response
export const getPositionCounts = (groupe: any) => {
  if (!groupe) return { pour: 0, contre: 0, abstention: 0, absent: 0 };

  // Handle different API response formats
  if (groupe.decompte) {
    // Format from groupe_vote_detail endpoint
    return {
      pour: countVotants(groupe.decompte.pours),
      contre: countVotants(groupe.decompte.contres),
      abstention: countVotants(groupe.decompte.abstentions),
      absent: countVotants(groupe.decompte.nonVotants)
    };
  } else if (groupe.votes) {
    // Format from scrutin_votes_detail endpoint
    return {
      pour: countVotants(groupe.votes.pours),
      contre: countVotants(groupe.votes.contres),
      abstention: countVotants(groupe.votes.abstentions),
      absent: countVotants(groupe.votes.nonVotants)
    };
  } else {
    // Direct access to votes categories
    return {
      pour: countVotants(groupe.pours),
      contre: countVotants(groupe.contres),
      abstention: countVotants(groupe.abstentions),
      absent: countVotants(groupe.nonVotants)
    };
  }
};

export const normalizePosition = (apiPosition: string): VotePosition => {
  if (!apiPosition) return 'absent';
  
  const positionMap: Record<string, VotePosition> = {
    'Pour': 'pour',
    'pour': 'pour',
    'Contre': 'contre',
    'contre': 'contre',
    'Abstention': 'abstention',
    'abstention': 'abstention',
    'Non-votant': 'absent',
    'Non votant': 'absent',
    'absent': 'absent'
  };
  
  return positionMap[apiPosition] || 'absent';
};

// Process deputies from vote detail API response
export const processDeputiesFromVoteDetail = (groupDetail: any) => {
  if (!groupDetail) return [];
  
  // Different ways data could be structured
  const deputies: any[] = [];
  
  // Handle structure from groupe_vote_detail endpoint
  if (groupDetail.decompte) {
    // For "pour" votes
    if (groupDetail.decompte.pours && groupDetail.decompte.pours.votant) {
      const votants = Array.isArray(groupDetail.decompte.pours.votant) 
        ? groupDetail.decompte.pours.votant 
        : [groupDetail.decompte.pours.votant];
      
      votants.forEach((depute: any) => {
        deputies.push({
          id: depute.acteurRef,
          prenom: depute.prenom || '',
          nom: depute.nom || '',
          position: 'pour',
          delegation: depute.parDelegation === 'true'
        });
      });
    }
    
    // For "contre" votes
    if (groupDetail.decompte.contres && groupDetail.decompte.contres.votant) {
      const votants = Array.isArray(groupDetail.decompte.contres.votant) 
        ? groupDetail.decompte.contres.votant 
        : [groupDetail.decompte.contres.votant];
      
      votants.forEach((depute: any) => {
        deputies.push({
          id: depute.acteurRef,
          prenom: depute.prenom || '',
          nom: depute.nom || '',
          position: 'contre',
          delegation: depute.parDelegation === 'true'
        });
      });
    }
    
    // For "abstention" votes
    if (groupDetail.decompte.abstentions && groupDetail.decompte.abstentions.votant) {
      const votants = Array.isArray(groupDetail.decompte.abstentions.votant) 
        ? groupDetail.decompte.abstentions.votant 
        : [groupDetail.decompte.abstentions.votant];
      
      votants.forEach((depute: any) => {
        deputies.push({
          id: depute.acteurRef,
          prenom: depute.prenom || '',
          nom: depute.nom || '',
          position: 'abstention',
          delegation: depute.parDelegation === 'true'
        });
      });
    }
    
    // For "non-votant" (absent) votes
    if (groupDetail.decompte.nonVotants && groupDetail.decompte.nonVotants.votant) {
      const votants = Array.isArray(groupDetail.decompte.nonVotants.votant) 
        ? groupDetail.decompte.nonVotants.votant 
        : [groupDetail.decompte.nonVotants.votant];
      
      votants.forEach((depute: any) => {
        deputies.push({
          id: depute.acteurRef,
          prenom: depute.prenom || '',
          nom: depute.nom || '',
          position: 'absent',
          delegation: depute.parDelegation === 'true',
          causePosition: depute.causePositionVote
        });
      });
    }
  } else if (groupDetail.votes) {
    // Alternative structure for scrutin_votes_detail endpoint
    const voteTypes = [
      { key: 'pours', position: 'pour' },
      { key: 'contres', position: 'contre' },
      { key: 'abstentions', position: 'abstention' },
      { key: 'nonVotants', position: 'absent' }
    ];
    
    voteTypes.forEach(({ key, position }) => {
      if (groupDetail.votes[key] && groupDetail.votes[key].votant) {
        const votants = Array.isArray(groupDetail.votes[key].votant) 
          ? groupDetail.votes[key].votant 
          : [groupDetail.votes[key].votant];
        
        votants.forEach((depute: any) => {
          deputies.push({
            id: depute.acteurRef,
            prenom: depute.prenom || '',
            nom: depute.nom || '',
            position,
            delegation: depute.parDelegation === 'true',
            causePosition: depute.causePositionVote
          });
        });
      }
    });
  } else {
    // Direct structure (votes directly in group object)
    const voteTypes = [
      { key: 'pours', position: 'pour' },
      { key: 'contres', position: 'contre' },
      { key: 'abstentions', position: 'abstention' },
      { key: 'nonVotants', position: 'absent' }
    ];
    
    voteTypes.forEach(({ key, position }) => {
      if (groupDetail[key] && groupDetail[key].votant) {
        const votants = Array.isArray(groupDetail[key].votant) 
          ? groupDetail[key].votant 
          : [groupDetail[key].votant];
        
        votants.forEach((depute: any) => {
          deputies.push({
            id: depute.acteurRef,
            prenom: depute.prenom || '',
            nom: depute.nom || '',
            position,
            delegation: depute.parDelegation === 'true',
            causePosition: depute.causePositionVote
          });
        });
      }
    });
  }

  // Fetch names from API if not already in data
  deputies.forEach(deputy => {
    if (!deputy.nom || !deputy.prenom) {
      // This would be the place to fetch deputy names from API
      // But since we're just displaying what we have, we'll use placeholders
      deputy.nom = deputy.nom || `Député ${deputy.id}`;
      deputy.prenom = deputy.prenom || '';
    }
  });
  
  return deputies;
};

export const generateAssembleeUrl = (legislature: string, voteId: string) => {
  return `https://www2.assemblee-nationale.fr/scrutins/detail/(legislature)/${legislature}/(num)/${voteId}`;
};

// Extract group name safely from various API response formats
export const getGroupName = (groupe: any) => {
  if (!groupe) return 'Groupe inconnu';
  
  // Try different properties where the name could be stored
  return groupe.nom || groupe.libelle || groupe.organeName || 'Groupe inconnu';
};

// Process group data from scrutin_votes_detail API response
export const processGroupsFromVoteDetail = (voteDetail: any) => {
  const groups: Record<string, any> = {};
  
  // Handle array format
  if (voteDetail.groupes && Array.isArray(voteDetail.groupes)) {
    voteDetail.groupes.forEach((groupe: any) => {
      const groupId = groupe.organeRef || groupe.uid;
      if (groupId) {
        groups[groupId] = {
          ...groupe,
          groupe: {
            nom: getGroupName(groupe),
            uid: groupId,
            positionMajoritaire: normalizePosition(groupe.position_majoritaire || groupe.positionMajoritaire)
          }
        };
      }
    });
  } 
  // Handle object format
  else if (voteDetail.groupes && typeof voteDetail.groupes === 'object') {
    Object.entries(voteDetail.groupes).forEach(([groupId, groupe]: [string, any]) => {
      groups[groupId] = {
        ...groupe,
        groupe: {
          nom: getGroupName(groupe),
          uid: groupId,
          positionMajoritaire: normalizePosition(groupe.position_majoritaire || groupe.positionMajoritaire)
        }
      };
    });
  }
  
  return groups;
};
