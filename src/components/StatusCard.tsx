
import React from 'react';
import { Card } from '@/components/ui/card';
import { ProcessStatus, StatusMessage } from '@/utils/types';
import { CheckCircle2, AlertTriangle, Search, ServerCrash } from 'lucide-react';

interface StatusCardProps {
  status: StatusMessage;
}

const StatusCard: React.FC<StatusCardProps> = ({ status }) => {
  const getIcon = (status: ProcessStatus) => {
    switch (status) {
      case 'loading':
        return <Search className="h-5 w-5 text-blue-500 animate-pulse" />;
      case 'complete':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getProgressPercentage = (status: ProcessStatus) => {
    switch (status) {
      case 'loading':
        return 70;
      case 'complete':
        return 100;
      case 'error':
        return 100;
      default:
        return 0;
    }
  };

  if (status.status === 'idle') return null;

  return (
    <Card className="p-4 shadow-sm border border-gray-100 glassmorphism animate-fade-in rounded-xl overflow-hidden">
      <div className="flex items-center space-x-3">
        {getIcon(status.status)}
        <div className="flex-1">
          <h3 className="font-medium text-sm">{status.message}</h3>
          {status.details && (
            <p className="text-xs text-gray-500 mt-0.5">{status.details}</p>
          )}
        </div>
      </div>
      
      {status.status === 'loading' && (
        <div className="mt-3 w-full h-1 bg-gray-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${getProgressPercentage(status.status)}%` }}
          ></div>
        </div>
      )}
    </Card>
  );
};

export default StatusCard;
