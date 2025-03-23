
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import MainNavigation from '@/components/MainNavigation';
import APIErrorHandler from '@/components/APIErrorHandler';
import { useVoteDetails } from '@/hooks/useVoteDetails';
import VoteDetailsSkeleton from '@/components/votes/VoteDetailsSkeleton';
import VoteDetailsHeader from '@/components/votes/VoteDetailsHeader';
import VoteSummaryCard from '@/components/votes/VoteSummaryCard';
import VoteDetailsTabs from '@/components/votes/VoteDetailsTabs';
import VoteNotFound from '@/components/votes/VoteNotFound';

const VoteDetails = () => {
  const { voteId, legislature = '17' } = useParams<{ voteId: string, legislature?: string }>();
  const [selectedTab, setSelectedTab] = useState<string>('groups');
  
  const {
    voteDetails,
    groupsData,
    setGroupsData,
    loading,
    error,
    voteCounts
  } = useVoteDetails(voteId, legislature);

  if (loading) {
    return <VoteDetailsSkeleton />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <MainNavigation />
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <APIErrorHandler 
            status={{
              status: 'error',
              message: 'Erreur lors du chargement des données',
              details: error
            }}
            redirectTo="/"
            redirectLabel="Retour à l'accueil"
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <MainNavigation />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {voteDetails ? (
          <div className="space-y-6">
            <VoteDetailsHeader 
              voteId={voteId || ''} 
              legislature={legislature}
              dateScrutin={voteDetails.scrutin?.date || voteDetails.dateScrutin}
            />

            <VoteSummaryCard 
              title={voteDetails.scrutin?.titre || voteDetails.titre || 'Titre non disponible'} 
              description={voteDetails.scrutin?.description || voteDetails.description || 'Description non disponible'}
              voteCounts={voteCounts}
            />

            <VoteDetailsTabs 
              selectedTab={selectedTab}
              setSelectedTab={setSelectedTab}
              voteDetails={voteDetails}
              voteId={voteId || ''}
              legislature={legislature}
              groupsData={groupsData}
              setGroupsData={setGroupsData}
            />
          </div>
        ) : (
          <VoteNotFound voteId={voteId || ''} legislature={legislature} />
        )}
      </main>
    </div>
  );
};

export default VoteDetails;
