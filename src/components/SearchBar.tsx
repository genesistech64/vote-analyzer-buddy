
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface SearchBarProps {
  onSearch: (deputyId: string) => void;
  isLoading: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isLoading }) => {
  const [deputyId, setDeputyId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (deputyId.trim()) {
      onSearch(deputyId.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto">
      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <Input
            type="text"
            value={deputyId}
            onChange={(e) => setDeputyId(e.target.value)}
            placeholder="Identifiant du député (ex: PA1592)"
            className="pl-10 h-12 rounded-lg border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
            disabled={isLoading}
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
        </div>
        <Button 
          type="submit" 
          className="h-12 px-6 rounded-lg bg-primary hover:bg-primary/90 transition-all duration-200 font-medium"
          disabled={isLoading || !deputyId.trim()}
        >
          {isLoading ? (
            <div className="flex items-center">
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
              Analyse...
            </div>
          ) : (
            'Analyser les votes'
          )}
        </Button>
      </div>
    </form>
  );
};

export default SearchBar;
