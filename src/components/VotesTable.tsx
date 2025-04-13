import React, { useState, useMemo } from 'react';
import { DeputyVoteData, VotePosition } from '@/utils/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  CheckCircle2, 
  XCircle, 
  Minus, 
  Clock, 
  Download, 
  Search,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Filter,
  BarChart4
} from 'lucide-react';
import {
  ToggleGroup,
  ToggleGroupItem
} from '@/components/ui/toggle-group';
import { useNavigate } from 'react-router-dom';

interface VotesTableProps {
  data: DeputyVoteData[];
  isLoading?: boolean;
  exportToCSV?: (data: DeputyVoteData[]) => void;
}

type SortField = 'dateScrutin' | 'position' | 'numero';
type SortDirection = 'asc' | 'desc';

const VotesTable: React.FC<VotesTableProps> = ({ 
  data, 
  isLoading = false, 
  exportToCSV = () => {} 
}) => {
  // Ensure data is an array before processing
  const safeData = Array.isArray(data) ? data : [];
  const navigate = useNavigate();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('dateScrutin');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [positionFilter, setPositionFilter] = useState<VotePosition[]>([]);
  
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };
  
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    
    try {
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
    } catch (e) {
      return dateString;
    }
  };

  const generateScrutinUrl = (numero: string, dateStr: string) => {
    const year = dateStr.split('-')[0];
    return `https://www2.assemblee-nationale.fr/scrutins/detail/(legislature)/17/(num)/${numero}`;
  };
  
  const positionIcons = {
    pour: <CheckCircle2 className="h-5 w-5 text-vote-pour" />,
    contre: <XCircle className="h-5 w-5 text-vote-contre" />,
    abstention: <Minus className="h-5 w-5 text-vote-abstention" />,
    absent: <Clock className="h-5 w-5 text-vote-absent" />
  };
  
  const positionLabels = {
    pour: 'Pour',
    contre: 'Contre',
    abstention: 'Abstention',
    absent: 'Absent'
  };

  const handlePositionFilterChange = (value: string[]) => {
    setPositionFilter(value as VotePosition[]);
  };
  
  const filteredData = useMemo(() => {
    return safeData
      .filter(item => 
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.numero.includes(searchTerm)
      )
      .filter(item => 
        positionFilter.length === 0 || positionFilter.includes(item.position)
      )
      .sort((a, b) => {
        if (sortField === 'dateScrutin') {
          const dateA = new Date(a.dateScrutin).getTime();
          const dateB = new Date(b.dateScrutin).getTime();
          return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
        } else if (sortField === 'position') {
          const positions: Record<VotePosition, number> = {
            pour: 1,
            contre: 2,
            abstention: 3,
            absent: 4
          };
          const posA = positions[a.position];
          const posB = positions[b.position];
          return sortDirection === 'asc' ? posA - posB : posB - posA;
        } else if (sortField === 'numero') {
          const numA = parseInt(a.numero);
          const numB = parseInt(b.numero);
          return sortDirection === 'asc' ? numA - numB : numB - numA;
        }
        return 0;
      });
  }, [safeData, searchTerm, positionFilter, sortField, sortDirection]);
  
  const handleExport = () => {
    if (exportToCSV) {
      exportToCSV(filteredData);
    }
  };
  
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUp className="h-4 w-4 opacity-30" />;
    return sortDirection === 'asc' 
      ? <ChevronUp className="h-4 w-4" /> 
      : <ChevronDown className="h-4 w-4" />;
  };
  
  const handleRowClick = (numero: string, dateScrutin: string) => {
    const url = generateScrutinUrl(numero, dateScrutin);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleViewVoteDetails = (e: React.MouseEvent, numero: string) => {
    e.stopPropagation(); // Prevent row click from firing
    navigate(`/votes/17/${numero}`);
  };
  
  if (isLoading) {
    return (
      <div className="w-full h-64 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500">Chargement des données...</p>
        </div>
      </div>
    );
  }
  
  if (!safeData.length) {
    return null;
  }
  
  return (
    <div className="w-full space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
          <Input
            type="search"
            placeholder="Rechercher un vote..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 border-gray-200"
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Positions :</span>
          </div>
          
          <ToggleGroup type="multiple" onValueChange={handlePositionFilterChange} value={positionFilter}>
            <ToggleGroupItem value="pour" aria-label="Filtrer les votes pour" className="px-3 py-1 h-9">
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-vote-pour" />
                <span className="text-xs sm:text-sm">Pour</span>
              </div>
            </ToggleGroupItem>
            
            <ToggleGroupItem value="contre" aria-label="Filtrer les votes contre" className="px-3 py-1 h-9">
              <div className="flex items-center gap-1">
                <XCircle className="h-4 w-4 text-vote-contre" />
                <span className="text-xs sm:text-sm">Contre</span>
              </div>
            </ToggleGroupItem>
            
            <ToggleGroupItem value="abstention" aria-label="Filtrer les abstentions" className="px-3 py-1 h-9">
              <div className="flex items-center gap-1">
                <Minus className="h-4 w-4 text-vote-abstention" />
                <span className="text-xs sm:text-sm">Abstention</span>
              </div>
            </ToggleGroupItem>
            
            <ToggleGroupItem value="absent" aria-label="Filtrer les absences" className="px-3 py-1 h-9">
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4 text-vote-absent" />
                <span className="text-xs sm:text-sm">Absent</span>
              </div>
            </ToggleGroupItem>
          </ToggleGroup>
          
          <Button 
            onClick={handleExport}
            className="flex items-center space-x-1 bg-gray-100 hover:bg-gray-200 text-gray-700 ml-auto"
            variant="outline"
            size="sm"
          >
            <Download size={16} />
            <span>CSV</span>
          </Button>
        </div>
      </div>
      
      <div className="rounded-xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="min-h-[400px] overflow-auto">
          <Table>
            <TableHeader className="bg-gray-50 sticky top-0">
              <TableRow>
                <TableHead 
                  className="w-20 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('numero')}
                >
                  <div className="flex items-center space-x-1">
                    <span>N°</span>
                    <SortIcon field="numero" />
                  </div>
                </TableHead>
                <TableHead 
                  className="w-32 cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('dateScrutin')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Date</span>
                    <SortIcon field="dateScrutin" />
                  </div>
                </TableHead>
                <TableHead>Sujet</TableHead>
                <TableHead 
                  className="w-32 text-center cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleSort('position')}
                >
                  <div className="flex items-center justify-center space-x-1">
                    <span>Position</span>
                    <SortIcon field="position" />
                  </div>
                </TableHead>
                <TableHead className="w-24 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length > 0 ? (
                filteredData.map((item, index) => (
                  <TableRow 
                    key={item.numero} 
                    className="table-row-animate hover:bg-gray-50 cursor-pointer"
                    style={{ animationDelay: `${index * 20}ms` }}
                    onClick={() => handleRowClick(item.numero, item.dateScrutin)}
                  >
                    <TableCell className="font-mono">
                      <div className="flex items-center text-primary">
                        {item.numero}
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(item.dateScrutin)}</TableCell>
                    <TableCell className="max-w-xl truncate" title={item.title}>
                      {item.title}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center space-x-2">
                        {positionIcons[item.position]}
                        <span 
                          className={`text-sm font-medium ${
                            item.position === 'pour' ? 'text-vote-pour' :
                            item.position === 'contre' ? 'text-vote-contre' :
                            item.position === 'abstention' ? 'text-vote-abstention' :
                            'text-vote-absent'
                          }`}
                        >
                          {positionLabels[item.position]}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex items-center space-x-1"
                        onClick={(e) => handleViewVoteDetails(e, item.numero)}
                        title="Voir les détails par groupe politique"
                      >
                        <BarChart4 size={16} />
                        <span className="hidden sm:inline">Groupes</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-64 text-center text-gray-500">
                    Aucun résultat trouvé
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      
      <div className="text-sm text-gray-500 text-center">
        {filteredData.length} vote{filteredData.length !== 1 ? 's' : ''} affichés sur {safeData.length} au total
      </div>
    </div>
  );
};

export default VotesTable;
