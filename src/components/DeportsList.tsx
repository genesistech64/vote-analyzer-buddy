
import React from 'react';
import { DeportInfo } from '@/utils/types';
import { AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DeportsListProps {
  deports: DeportInfo[];
}

const DeportsList: React.FC<DeportsListProps> = ({ deports }) => {
  if (!deports.length) return null;

  return (
    <Card className="w-full mb-8 animate-fade-in shadow-md">
      <CardHeader className="bg-gradient-to-r from-amber-50 to-amber-100 rounded-t-lg">
        <CardTitle className="text-center text-xl font-medium text-amber-800 flex items-center justify-center">
          <AlertCircle className="h-5 w-5 mr-2 text-amber-600" />
          Restrictions de vote déclarées
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          {deports.map((deport) => (
            <div 
              key={deport.id} 
              className="p-4 rounded-lg border border-amber-100 bg-amber-50"
            >
              <div className="text-amber-700 font-medium mb-1">
                {deport.portee}
              </div>
              <div className="text-sm text-gray-600">
                {deport.cible}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default DeportsList;
