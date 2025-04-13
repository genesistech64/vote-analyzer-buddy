
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RotateCw, Database, UserPlus, Users, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { countDeputiesInDb, triggerDeputiesSync, cleanupDeputiesDatabase, insertDeputy } from '@/utils/deputySupabaseService';
import APIErrorHandler from '@/components/APIErrorHandler';

interface DeputiesDataManagerProps {
  legislature: string;
  onRefresh?: () => void;
}

const DeputiesDataManager: React.FC<DeputiesDataManagerProps> = ({ 
  legislature,
  onRefresh 
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [deputiesCount, setDeputiesCount] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDeputy, setNewDeputy] = useState({
    deputy_id: '',
    first_name: '',
    last_name: '',
    legislature: legislature,
    political_group: '',
    political_group_id: '',
    profession: ''
  });

  useEffect(() => {
    fetchDeputiesCount();
  }, [legislature]);

  const fetchDeputiesCount = async () => {
    try {
      const count = await countDeputiesInDb(legislature);
      setDeputiesCount(count);
      return count;
    } catch (error) {
      console.error('Error counting deputies:', error);
      setError('Failed to get deputies count');
      return 0;
    }
  };

  const handleSync = async () => {
    setIsLoading(true);
    setSyncStatus('syncing');
    setError(null);
    
    try {
      toast.info('Synchronisation démarrée', {
        description: 'Cette opération peut prendre quelques minutes...',
        duration: 5000
      });
      
      const result = await triggerDeputiesSync(legislature, true);
      
      if (result.success) {
        setSyncStatus('success');
        setLastSync(new Date());
        toast.success('Synchronisation réussie', {
          description: `${result.deputies_count || 0} députés synchronisés`
        });
        
        // Refresh the count
        const newCount = await fetchDeputiesCount();
        if (newCount > 0 && onRefresh) {
          onRefresh();
        }
      } else {
        setSyncStatus('error');
        setError(result.message);
        
        // Check if we have any deputies despite the error
        if (result.deputies_count && result.deputies_count > 0) {
          toast.warning('Synchronisation partielle', {
            description: `${result.deputies_count} députés synchronisés malgré des erreurs`
          });
          
          // Refresh the count
          const newCount = await fetchDeputiesCount();
          if (newCount > 0 && onRefresh) {
            onRefresh();
          }
        } else {
          toast.error('Échec de la synchronisation', {
            description: result.message
          });
        }
      }
    } catch (error) {
      setSyncStatus('error');
      setError(error instanceof Error ? error.message : 'Une erreur inconnue est survenue');
      toast.error('Erreur lors de la synchronisation', {
        description: error instanceof Error ? error.message : 'Une erreur inconnue est survenue'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCleanup = async () => {
    setIsLoading(true);
    
    try {
      toast.info('Nettoyage de la base de données en cours...');
      
      const result = await cleanupDeputiesDatabase(legislature);
      
      if (result.status === 'complete') {
        toast.success('Nettoyage réussi', {
          description: result.message
        });
        
        // Refresh the count
        await fetchDeputiesCount();
      } else {
        toast.error('Échec du nettoyage', {
          description: result.message
        });
      }
    } catch (error) {
      toast.error('Erreur lors du nettoyage', {
        description: error instanceof Error ? error.message : 'Une erreur inconnue est survenue'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddDeputy = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // Make sure the ID has the PA prefix
      let deputyId = newDeputy.deputy_id;
      if (!deputyId.startsWith('PA') && !deputyId.startsWith('ND')) {
        deputyId = `PA${deputyId}`;
      }
      
      const success = await insertDeputy({
        ...newDeputy,
        deputy_id: deputyId
      });
      
      if (success) {
        toast.success('Député ajouté avec succès');
        setNewDeputy({
          deputy_id: '',
          first_name: '',
          last_name: '',
          legislature: legislature,
          political_group: '',
          political_group_id: '',
          profession: ''
        });
        setShowAddForm(false);
        
        // Refresh the count
        await fetchDeputiesCount();
        if (onRefresh) onRefresh();
      } else {
        toast.error('Échec de l\'ajout du député');
      }
    } catch (error) {
      toast.error('Erreur lors de l\'ajout du député', {
        description: error instanceof Error ? error.message : 'Une erreur inconnue est survenue'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full shadow-md">
      <CardHeader className="bg-slate-50 rounded-t-lg">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-xl font-bold flex items-center">
              <Database className="mr-2 h-5 w-5 text-blue-600" /> 
              Données des Députés
            </CardTitle>
            <CardDescription>
              Gestion de la base de données des députés pour la {legislature}e législature
            </CardDescription>
          </div>
          <Badge variant={deputiesCount ? (deputiesCount > 100 ? "default" : "warning") : "destructive"}>
            {deputiesCount !== null ? `${deputiesCount} députés` : 'Inconnu'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-4">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {syncStatus === 'syncing' && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Synchronisation en cours...</span>
              <span className="text-sm text-muted-foreground">Veuillez patienter</span>
            </div>
            <Progress value={45} className="h-2" />
          </div>
        )}
        
        {showAddForm ? (
          <form onSubmit={handleAddDeputy} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">ID du député</label>
                <input 
                  type="text" 
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="PA123456"
                  value={newDeputy.deputy_id}
                  onChange={(e) => setNewDeputy({...newDeputy, deputy_id: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Législature</label>
                <input 
                  type="text" 
                  className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-100"
                  value={legislature}
                  disabled
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Prénom</label>
                <input 
                  type="text" 
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Prénom"
                  value={newDeputy.first_name}
                  onChange={(e) => setNewDeputy({...newDeputy, first_name: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Nom</label>
                <input 
                  type="text" 
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Nom"
                  value={newDeputy.last_name}
                  onChange={(e) => setNewDeputy({...newDeputy, last_name: e.target.value})}
                  required
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Groupe politique</label>
                <input 
                  type="text" 
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Groupe politique"
                  value={newDeputy.political_group}
                  onChange={(e) => setNewDeputy({...newDeputy, political_group: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">ID du groupe</label>
                <input 
                  type="text" 
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="ID du groupe"
                  value={newDeputy.political_group_id}
                  onChange={(e) => setNewDeputy({...newDeputy, political_group_id: e.target.value})}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Profession</label>
              <input 
                type="text" 
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Profession"
                value={newDeputy.profession || ''}
                onChange={(e) => setNewDeputy({...newDeputy, profession: e.target.value})}
              />
            </div>
            
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddForm(false)}
                disabled={isLoading}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !newDeputy.deputy_id || !newDeputy.first_name || !newDeputy.last_name}
              >
                Ajouter le député
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Vous pouvez synchroniser manuellement la base de données des députés ou ajouter des députés individuellement.
            </p>
            
            {deputiesCount === 0 && (
              <Alert variant="warning" className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Base de données vide</AlertTitle>
                <AlertDescription>
                  Aucun député n'est actuellement enregistré dans la base de données pour la {legislature}e législature.
                  Lancez une synchronisation pour récupérer les données.
                </AlertDescription>
              </Alert>
            )}
            
            {lastSync && (
              <div className="text-sm text-gray-500">
                Dernière synchronisation: {lastSync.toLocaleString()}
              </div>
            )}
          </div>
        )}
      </CardContent>
      
      <CardFooter className="bg-slate-50 rounded-b-lg flex flex-wrap gap-2 justify-between">
        <div className="flex space-x-2">
          <Button
            variant="default"
            onClick={handleSync}
            disabled={isLoading}
            className="flex items-center"
          >
            <RotateCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Synchroniser
          </Button>
          
          <Button
            variant="outline"
            onClick={handleCleanup}
            disabled={isLoading || deputiesCount === 0}
            className="flex items-center"
          >
            <Database className="mr-2 h-4 w-4" />
            Nettoyer
          </Button>
        </div>
        
        <Button
          variant="secondary"
          onClick={() => setShowAddForm(!showAddForm)}
          disabled={isLoading}
          className="flex items-center"
        >
          <UserPlus className="mr-2 h-4 w-4" />
          {showAddForm ? 'Annuler' : 'Ajouter un député'}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default DeputiesDataManager;
