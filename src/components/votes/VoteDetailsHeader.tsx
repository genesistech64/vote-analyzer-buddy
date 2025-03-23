
import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { formatDate, generateAssembleeUrl } from './voteDetailsUtils';

interface VoteDetailsHeaderProps {
  voteId: string;
  legislature: string;
  dateScrutin?: string;
}

const VoteDetailsHeader: React.FC<VoteDetailsHeaderProps> = ({ 
  voteId, 
  legislature,
  dateScrutin 
}) => {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <Button asChild variant="outline" size="sm" className="mb-4">
          <Link to="/">
            <ChevronLeft size={16} className="mr-1" />
            Retour
          </Link>
        </Button>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Scrutin n°{voteId}</h1>
        <p className="text-gray-600 mt-1">
          <span className="font-medium">{formatDate(dateScrutin || '')}</span>
          <span className="mx-2">•</span>
          <span>
            {legislature}
            <sup>e</sup> législature
          </span>
        </p>
      </div>
      <Button
        variant="outline"
        className="flex items-center"
        onClick={() => window.open(generateAssembleeUrl(legislature, voteId || ''), '_blank', 'noopener,noreferrer')}
      >
        <ExternalLink size={16} className="mr-2" />
        Voir sur assemblee-nationale.fr
      </Button>
    </div>
  );
};

export default VoteDetailsHeader;
