
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import StatusCard from '@/components/StatusCard';
import { StatusMessage } from '@/utils/types';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface APIErrorHandlerProps {
  status: StatusMessage;
  redirectTo?: string;
  redirectLabel?: string;
  showToast?: boolean;
}

const APIErrorHandler: React.FC<APIErrorHandlerProps> = ({ 
  status, 
  redirectTo = "/", 
  redirectLabel = "Retour à l'accueil",
  showToast = true
}) => {
  // Show toast notification if specified
  useEffect(() => {
    if (showToast && status.status === 'error') {
      toast.error(`Erreur: ${status.message}`, {
        description: status.details || 'Veuillez réessayer ou contacter l\'administrateur si le problème persiste.'
      });
    } else if (showToast && status.status === 'warning') {
      toast.warning(status.message, {
        description: status.details
      });
    }
  }, [status, showToast]);

  return (
    <div className="w-full">
      <Alert 
        variant={status.status === 'error' ? 'destructive' : 
               (status.status === 'warning' ? 'warning' : 
               (status.status === 'complete' ? 'success' : 'default'))}
        className="mb-4"
      >
        <AlertTitle>{status.message}</AlertTitle>
        {status.details && <AlertDescription>{status.details}</AlertDescription>}
      </Alert>

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
