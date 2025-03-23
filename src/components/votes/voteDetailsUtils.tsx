
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

export const getPositionCounts = (groupe: any) => {
  if (!groupe) return { pour: 0, contre: 0, abstention: 0, absent: 0 };

  // Handle different API response formats
  if (groupe.decompte) {
    // Format from groupe_vote_detail endpoint
    return {
      pour: groupe.decompte.pours?.votant?.length || 0,
      contre: groupe.decompte.contres?.votant?.length || 0,
      abstention: groupe.decompte.abstentions?.votant?.length || 0,
      absent: groupe.decompte.nonVotants?.votant?.length || 0
    };
  } else {
    // Format from scrutin_votes_detail endpoint
    return {
      pour: groupe.pours?.votant?.length || 0,
      contre: groupe.contres?.votant?.length || 0,
      abstention: groupe.abstentions?.votant?.length || 0,
      absent: groupe.nonVotants?.votant?.length || 0
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

export const processDeputiesFromVoteDetail = (groupDetail: any) => {
  if (!groupDetail) return [];
  
  // Different ways data could be structured
  const deputies: any[] = [];
  
  // Handle structure from groupe_vote_detail endpoint
  if (groupDetail.decompte) {
    if (groupDetail.decompte.pours && groupDetail.decompte.pours.votant) {
      const votants = Array.isArray(groupDetail.decompte.pours.votant) 
        ? groupDetail.decompte.pours.votant 
        : [groupDetail.decompte.pours.votant];
      
      votants.forEach((depute: any) => {
        deputies.push({
          id: depute.acteurRef,
          nom: depute.nom,
          prenom: depute.prenom,
          position: 'pour'
        });
      });
    }
    
    if (groupDetail.decompte.contres && groupDetail.decompte.contres.votant) {
      const votants = Array.isArray(groupDetail.decompte.contres.votant) 
        ? groupDetail.decompte.contres.votant 
        : [groupDetail.decompte.contres.votant];
      
      votants.forEach((depute: any) => {
        deputies.push({
          id: depute.acteurRef,
          nom: depute.nom,
          prenom: depute.prenom,
          position: 'contre'
        });
      });
    }
    
    if (groupDetail.decompte.abstentions && groupDetail.decompte.abstentions.votant) {
      const votants = Array.isArray(groupDetail.decompte.abstentions.votant) 
        ? groupDetail.decompte.abstentions.votant 
        : [groupDetail.decompte.abstentions.votant];
      
      votants.forEach((depute: any) => {
        deputies.push({
          id: depute.acteurRef,
          nom: depute.nom,
          prenom: depute.prenom,
          position: 'abstention'
        });
      });
    }
    
    if (groupDetail.decompte.nonVotants && groupDetail.decompte.nonVotants.votant) {
      const votants = Array.isArray(groupDetail.decompte.nonVotants.votant) 
        ? groupDetail.decompte.nonVotants.votant 
        : [groupDetail.decompte.nonVotants.votant];
      
      votants.forEach((depute: any) => {
        deputies.push({
          id: depute.acteurRef,
          nom: depute.nom,
          prenom: depute.prenom,
          position: 'absent'
        });
      });
    }
  } else {
    // Alternative structure for scrutin_votes_detail endpoint
    const categories = ['pour', 'contre', 'abstention', 'absent'];
    categories.forEach(position => {
      const categoryKey = position === 'absent' ? 'nonVotants' : 
        position === 'pour' ? 'pours' : 
        position === 'contre' ? 'contres' : 'abstentions';
      
      if (groupDetail[categoryKey] && groupDetail[categoryKey].votant) {
        const votants = Array.isArray(groupDetail[categoryKey].votant) 
          ? groupDetail[categoryKey].votant 
          : [groupDetail[categoryKey].votant];
        
        votants.forEach((depute: any) => {
          deputies.push({
            id: depute.acteurRef,
            nom: depute.nom,
            prenom: depute.prenom,
            position: position as VotePosition
          });
        });
      }
    });
  }
  
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
            uid: groupId
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
          uid: groupId
        }
      };
    });
  }
  
  return groups;
};
