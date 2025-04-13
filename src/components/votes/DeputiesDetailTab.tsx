
import React, { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, User, CircleCheck, CheckCircle2, Download, RefreshCcw, Users } from 'lucide-react';
import { GroupVoteDetail, VotePosition } from '@/utils/types';
import { getGroupVoteDetail } from '@/utils/apiService';
import { processDeputiesFromVoteDetail } from './voteDetailsUtils';
import { prefetchDeputies } from '@/utils/deputyCache';
import { prefetchDeputiesFromSupabase } from '@/utils/deputySupabaseService';
import DeputiesDataManager from '@/components/DeputiesDataManager';
import { toast } from 'sonner';

interface Deputy {
  id: string;
  nom: string;
  prenom: string;
  groupe_politique?: string;
  position: VotePosition;
}

interface DeputiesDetailTabProps {
  groupsData: Record<string, GroupVoteDetail>;
  setGroupsData: React.Dispatch<React.SetStateAction<Record<string, GroupVoteDetail>>>;
  voteId: string;
  legislature: string;
}

const DeputiesDetailTab: React.FC<DeputiesDetailTabProps> = ({ 
  groupsData, 
  setGroupsData,
  voteId,
  legislature
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredDeputies, setFilteredDeputies] = useState<Deputy[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<VotePosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDataManager, setShowDataManager] = useState(false);
  const [totalDeputies, setTotalDeputies] = useState(0);

  const allDeputies = React.useMemo(() => {
    const deputies: Deputy[] = [];
    
    Object.entries(groupsData).forEach(([groupId, group]) => {
      const groupDeputies = processDeputiesFromVoteDetail(group);
      
      groupDeputies.forEach(deputy => {
        deputies.push({
          id: deputy.id || '',
          nom: deputy.nom || '',
          prenom: deputy.prenom || '',
          groupe_politique: group.organeRef || group.libelleAbrev || '',
          position: deputy.position
        });
      });
    });
    
    return deputies;
  }, [groupsData]);
  
  useEffect(() => {
    setTotalDeputies(allDeputies.length);
    
    // Apply filters
    let filtered = [...allDeputies];
    
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(deputy => 
        deputy.nom.toLowerCase().includes(lowerSearch) || 
        deputy.prenom.toLowerCase().includes(lowerSearch) ||
        `${deputy.prenom} ${deputy.nom}`.toLowerCase().includes(lowerSearch) ||
        deputy.id.toLowerCase().includes(lowerSearch)
      );
    }
    
    if (selectedPosition) {
      filtered = filtered.filter(deputy => deputy.position === selectedPosition);
    }
    
    setFilteredDeputies(filtered);
  }, [allDeputies, searchTerm, selectedPosition]);

  const loadAllGroups = async () => {
    setLoading(true);
    
    try {
      const groups = Object.keys(groupsData);
      
      // If we already have all the groups, don't fetch them again
      if (groups.length >= 10) {
        toast.info('Tous les groupes sont déjà chargés');
        return;
      }
      
      // Fetch data for all groups referenced in the vote
      const allFetchedGroups = { ...groupsData };
      let newGroupsCount = 0;
      
      // Get all group IDs from vote details that we don't already have
      const allGroupIds = Object.values(groupsData).flatMap(group => 
        group?.scrutin?.ventilationVotes?.organe?.map(org => org?.organeRef) || []
      ).filter(Boolean);
      
      const uniqueGroupIds = [...new Set(allGroupIds)];
      const missingGroupIds = uniqueGroupIds.filter(id => !allFetchedGroups[id || '']);
      
      toast.info(`Chargement de ${missingGroupIds.length} groupes supplémentaires...`);
      
      // Fetch each missing group detail
      for (const groupId of missingGroupIds) {
        if (!groupId) continue;
        
        try {
          const groupDetail = await getGroupVoteDetail(groupId, voteId, legislature);
          
          if (groupDetail) {
            allFetchedGroups[groupId] = groupDetail;
            newGroupsCount++;
          }
        } catch (error) {
          console.error(`Error fetching group ${groupId}:`, error);
        }
      }
      
      // Update the state with all the new groups
      setGroupsData(allFetchedGroups);
      
      // Prefetch all deputy IDs from all groups
      const allDeputyIds = Object.values(allFetchedGroups).flatMap(group => 
        processDeputiesFromVoteDetail(group).map(deputy => deputy.id)
      ).filter(Boolean) as string[];
      
      if (allDeputyIds.length > 0) {
        console.log(`Prefetching ${allDeputyIds.length} deputies from all groups`);
        prefetchDeputiesFromSupabase(allDeputyIds, legislature)
          .then(() => prefetchDeputies(allDeputyIds));
      }
      
      toast.success(
        `${newGroupsCount} groupes chargés avec succès`, 
        { description: `Total: ${Object.keys(allFetchedGroups).length} groupes` }
      );
    } catch (error) {
      console.error('Error loading all groups:', error);
      toast.error(
        'Erreur lors du chargement des groupes', 
        { description: error instanceof Error ? error.message : 'Une erreur est survenue' }
      );
    } finally {
      setLoading(false);
    }
  };

  const exportDeputiesCSV = () => {
    const deputies = selectedPosition ? filteredDeputies : allDeputies;
    
    if (deputies.length === 0) {
      toast.error('Aucun député à exporter');
      return;
    }
    
    // Create CSV content
    const headers = ['ID', 'Prénom', 'Nom', 'Groupe', 'Position'];
    const rows = deputies.map(d => [
      d.id,
      d.prenom,
      d.nom,
      d.groupe_politique,
      d.position
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `deputes_vote_${voteId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success(`${deputies.length} députés exportés en CSV`);
  };

  const refreshDeputiesData = () => {
    setShowDataManager(false);
    // Force recalculation of deputies from groups data
    setGroupsData({...groupsData});
    toast.success('Liste des députés rafraîchie');
  };

  return (
    <div className="space-y-6">
      {showDataManager ? (
        <div className="mb-4">
          <DeputiesDataManager 
            legislature={legislature} 
            onRefresh={refreshDeputiesData}
          />
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => setShowDataManager(false)}>
              Retour à la liste des députés
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex-1 w-full md:w-auto">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                <Input
                  type="search"
                  placeholder="Rechercher un député..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={selectedPosition === null ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setSelectedPosition(null)}
              >
                Tous ({allDeputies.length})
              </Badge>
              <Badge
                variant={selectedPosition === 'pour' ? "success" : "outline"}
                className="cursor-pointer"
                onClick={() => setSelectedPosition('pour')}
              >
                Pour ({allDeputies.filter(d => d.position === 'pour').length})
              </Badge>
              <Badge
                variant={selectedPosition === 'contre' ? "destructive" : "outline"}
                className="cursor-pointer"
                onClick={() => setSelectedPosition('contre')}
              >
                Contre ({allDeputies.filter(d => d.position === 'contre').length})
              </Badge>
              <Badge
                variant={selectedPosition === 'abstention' ? "warning" : "outline"}
                className="cursor-pointer"
                onClick={() => setSelectedPosition('abstention')}
              >
                Abstention ({allDeputies.filter(d => d.position === 'abstention').length})
              </Badge>
              <Badge
                variant={selectedPosition === 'nonVotant' ? "secondary" : "outline"}
                className="cursor-pointer"
                onClick={() => setSelectedPosition('nonVotant')}
              >
                Non-votant ({allDeputies.filter(d => d.position === 'nonVotant').length})
              </Badge>
            </div>
          </div>
          
          <div className="flex justify-between items-center">
            <div className="flex items-center text-sm text-gray-600">
              <Users className="h-4 w-4 mr-1" />
              {totalDeputies === 0 ? (
                <span>Aucun député chargé</span>
              ) : (
                <span>
                  {filteredDeputies.length} député{filteredDeputies.length > 1 ? 's' : ''} 
                  {filteredDeputies.length !== totalDeputies && ` (sur ${totalDeputies})`}
                </span>
              )}
            </div>
            
            <div className="flex space-x-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowDataManager(true)}
                className="flex items-center"
              >
                <Database className="mr-1 h-4 w-4" />
                <span className="hidden sm:inline">Gérer les données</span>
                <span className="inline sm:hidden">Données</span>
              </Button>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={loadAllGroups}
                disabled={loading}
                className="flex items-center"
              >
                <RefreshCcw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Charger tous les groupes</span>
                <span className="inline sm:hidden">Groupes</span>
              </Button>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportDeputiesCSV}
                disabled={filteredDeputies.length === 0}
                className="flex items-center"
              >
                <Download className="mr-1 h-4 w-4" />
                <span className="hidden sm:inline">Exporter CSV</span>
                <span className="inline sm:hidden">CSV</span>
              </Button>
            </div>
          </div>
          
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Député</TableHead>
                  <TableHead>Groupe</TableHead>
                  <TableHead className="text-right">Position</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDeputies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-gray-500">
                      {searchTerm 
                        ? "Aucun député trouvé avec ces critères de recherche" 
                        : "Aucun député chargé. Cliquez sur 'Charger tous les groupes' pour afficher les données"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDeputies.map((deputy, index) => (
                    <TableRow key={`${deputy.id}-${index}`}>
                      <TableCell className="font-medium flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-500" />
                        <div>
                          <div>{deputy.prenom} {deputy.nom}</div>
                          <div className="text-xs text-gray-500">{deputy.id}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{deputy.groupe_politique}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {deputy.position === 'pour' && (
                          <Badge variant="success" className="flex items-center justify-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Pour
                          </Badge>
                        )}
                        {deputy.position === 'contre' && (
                          <Badge variant="destructive" className="flex items-center justify-center gap-1">
                            Contre
                          </Badge>
                        )}
                        {deputy.position === 'abstention' && (
                          <Badge variant="warning" className="flex items-center justify-center gap-1">
                            Abstention
                          </Badge>
                        )}
                        {deputy.position === 'nonVotant' && (
                          <Badge variant="outline" className="flex items-center justify-center gap-1">
                            Non-votant
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
};

export default DeputiesDetailTab;
