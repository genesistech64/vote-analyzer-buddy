
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface VoteSummaryCardProps {
  title: string;
  description: string;
  voteCounts: {
    votants: number;
    pour: number;
    contre: number;
    abstention: number;
  };
}

const VoteSummaryCard: React.FC<VoteSummaryCardProps> = ({ 
  title, 
  description, 
  voteCounts 
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          {title || 'Titre non disponible'}
        </CardTitle>
        <CardDescription>
          {description || 'Description non disponible'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="bg-gray-100 px-3 py-2 rounded-md">
            <span className="text-sm font-medium">Votants: </span>
            <span className="font-bold">{voteCounts.votants || 'N/A'}</span>
          </div>
          <div className="bg-green-50 px-3 py-2 rounded-md">
            <span className="text-sm font-medium">Pour: </span>
            <span className="font-bold text-vote-pour">{voteCounts.pour || 'N/A'}</span>
          </div>
          <div className="bg-red-50 px-3 py-2 rounded-md">
            <span className="text-sm font-medium">Contre: </span>
            <span className="font-bold text-vote-contre">{voteCounts.contre || 'N/A'}</span>
          </div>
          <div className="bg-blue-50 px-3 py-2 rounded-md">
            <span className="text-sm font-medium">Abstentions: </span>
            <span className="font-bold text-vote-abstention">{voteCounts.abstention || 'N/A'}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default VoteSummaryCard;
