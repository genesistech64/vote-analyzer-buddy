
import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import StatusCard from '@/components/StatusCard';
import { StatusMessage } from '@/utils/types';

interface APIErrorHandlerProps {
  status: StatusMessage;
  redirectTo?: string;
  redirectLabel?: string;
}

const APIErrorHandler: React.FC<APIErrorHandlerProps> = ({ 
  status, 
  redirectTo = "/", 
  redirectLabel = "Retour à l'accueil" 
}) => {
  return (
    <div className="w-full">
      <StatusCard status={status} />
      <div className="mt-4 text-center">
        <Button asChild variant="outline">
          <Link to={redirectTo}>
            <ChevronLeft size={16} className="mr-2" />
            {redirectLabel}
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default APIErrorHandler;
