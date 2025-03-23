
import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';

interface VoteNotFoundProps {
  voteId: string;
  legislature: string;
}

const VoteNotFound: React.FC<VoteNotFoundProps> = ({ voteId, legislature }) => {
  return (
    <div className="text-center py-12">
      <h2 className="text-2xl font-bold mb-4">Scrutin non trouvé</h2>
      <p className="text-gray-600 mb-6">Le scrutin n°{voteId} n'a pas été trouvé dans la {legislature}e législature.</p>
      <Button asChild>
        <Link to="/">
          <ChevronLeft size={16} className="mr-2" />
          Retour à l'accueil
        </Link>
      </Button>
    </div>
  );
};

export default VoteNotFound;
