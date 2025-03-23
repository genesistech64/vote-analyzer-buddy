
import React from 'react';
import MainNavigation from '@/components/MainNavigation';
import { Card, CardContent } from '@/components/ui/card';

const VoteDetailsSkeleton = () => {
  return (
    <div className="min-h-screen bg-background">
      <MainNavigation />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="w-full h-64 flex items-center justify-center">
          <div className="flex flex-col items-center space-y-4">
            <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-500">Chargement des données du vote...</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default VoteDetailsSkeleton;
