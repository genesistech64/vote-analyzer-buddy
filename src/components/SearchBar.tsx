
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, User } from 'lucide-react';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { DeputeSearchResult } from '@/utils/types';

interface SearchBarProps {
  onSearch: (query: string) => void;
  onSelectDepute?: (deputeId: string) => void;
  isLoading: boolean;
  searchResult?: DeputeSearchResult;
}

const SearchBar: React.FC<SearchBarProps> = ({ 
  onSearch, 
  onSelectDepute,
  isLoading, 
  searchResult 
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onSearch(searchQuery.trim());
    }
  };

  const handleSelectDepute = (deputeId: string) => {
    console.log('[SearchBar] Selected députe ID before passing to parent:', deputeId);
    if (onSelectDepute) {
      onSelectDepute(deputeId);
    }
  };

  // Helper function to safely display deputy ID
  const renderDeputyId = (id: any): string => {
    console.log('[SearchBar] Rendering deputy ID:', id, 'type:', typeof id);
    
    if (typeof id === 'string') return id;
    
    if (id && typeof id === 'object') {
      if ('#text' in id) return String(id['#text']);
      if ('uid' in id) return String(id.uid);
    }
    
    // Last resort: stringify whatever we have
    const result = String(id || '');
    console.log('[SearchBar] Stringified deputy ID result:', result);
    return result;
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      <form onSubmit={handleSubmit} className="w-full">
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Identifiant (PA1592) ou nom du député"
              className="pl-10 h-12 rounded-lg border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
              disabled={isLoading}
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          </div>
          <Button 
            type="submit" 
            className="h-12 px-6 rounded-lg bg-primary hover:bg-primary/90 transition-all duration-200 font-medium"
            disabled={isLoading || !searchQuery.trim()}
          >
            {isLoading ? (
              <div className="flex items-center">
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Recherche...
              </div>
            ) : (
              'Rechercher'
            )}
          </Button>
        </div>
      </form>

      {/* Affichage des résultats multiples (homonymes) */}
      {searchResult?.multipleResults && searchResult.options && (
        <div className="w-full p-4 bg-white rounded-lg shadow-md border border-gray-100 animate-fade-in">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Plusieurs députés trouvés, veuillez sélectionner :
          </h3>
          <ul className="space-y-2">
            {searchResult.options.map((option) => {
              const optionId = renderDeputyId(option.id);
              console.log('[SearchBar] Option ID for deputy:', option.prenom, option.nom, '=', optionId);
              
              return (
                <li key={optionId}>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start text-left"
                    onClick={() => handleSelectDepute(optionId)}
                  >
                    <User className="h-4 w-4 mr-2 text-gray-500" />
                    <span>{option.prenom} {option.nom}</span>
                    <span className="ml-2 text-xs text-gray-500 font-mono">{optionId}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Affichage des informations du député trouvé */}
      {searchResult?.success && searchResult.deputeInfo && (
        <div className="w-full p-4 bg-white rounded-lg shadow-md border border-gray-100 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-800">
                {searchResult.deputeInfo.prenom} {searchResult.deputeInfo.nom}
              </h3>
              <div className="text-xs text-gray-500 flex items-center mt-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help inline-flex items-center">
                        <User className="h-3 w-3 mr-1" />
                        {searchResult.deputeInfo.profession}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Profession déclarée</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
              {renderDeputyId(searchResult.deputeInfo.id)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
