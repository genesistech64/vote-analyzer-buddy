
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

  return {
    pour: groupe.pours?.votant?.length || 0,
    contre: groupe.contres?.votant?.length || 0,
    abstention: groupe.abstentions?.votant?.length || 0,
    absent: groupe.nonVotants?.votant?.length || 0
  };
};

export const normalizePosition = (apiPosition: string): VotePosition => {
  if (!apiPosition) return 'absent';
  
  const positionMap: Record<string, VotePosition> = {
    'Pour': 'pour',
    'Contre': 'contre',
    'Abstention': 'abstention',
    'Non-votant': 'absent',
    'Non votant': 'absent'
  };
  
  return positionMap[apiPosition] || 'absent';
};

export const processDeputiesFromVoteDetail = (groupDetail: any) => {
  if (!groupDetail || !groupDetail.decompte) return [];
  
  const deputies: any[] = [];
  
  if (groupDetail.decompte.pours && groupDetail.decompte.pours.votant) {
    groupDetail.decompte.pours.votant.forEach((depute: any) => {
      deputies.push({
        id: depute.acteurRef,
        nom: depute.nom,
        prenom: depute.prenom,
        position: 'pour'
      });
    });
  }
  
  if (groupDetail.decompte.contres && groupDetail.decompte.contres.votant) {
    groupDetail.decompte.contres.votant.forEach((depute: any) => {
      deputies.push({
        id: depute.acteurRef,
        nom: depute.nom,
        prenom: depute.prenom,
        position: 'contre'
      });
    });
  }
  
  if (groupDetail.decompte.abstentions && groupDetail.decompte.abstentions.votant) {
    groupDetail.decompte.abstentions.votant.forEach((depute: any) => {
      deputies.push({
        id: depute.acteurRef,
        nom: depute.nom,
        prenom: depute.prenom,
        position: 'abstention'
      });
    });
  }
  
  if (groupDetail.decompte.nonVotants && groupDetail.decompte.nonVotants.votant) {
    groupDetail.decompte.nonVotants.votant.forEach((depute: any) => {
      deputies.push({
        id: depute.acteurRef,
        nom: depute.nom,
        prenom: depute.prenom,
        position: 'absent'
      });
    });
  }
  
  return deputies;
};

export const generateAssembleeUrl = (legislature: string, voteId: string) => {
  return `https://www2.assemblee-nationale.fr/scrutins/detail/(legislature)/${legislature}/(num)/${voteId}`;
};
