
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, Download, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { DeputyVoteData } from '@/utils/types';

interface VotesTableProps {
  data: DeputyVoteData[];
  isLoading: boolean;
  exportToCSV: (data: DeputyVoteData[], deputyName: string) => void;
}

const VotesTable: React.FC<VotesTableProps> = ({ data, isLoading, exportToCSV }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<keyof DeputyVoteData>('dateScrutin');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const itemsPerPage = 10;

  const handleSort = (field: keyof DeputyVoteData) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedData = [...data].sort((a, b) => {
    if (sortField === 'numero') {
      return sortDirection === 'asc' 
        ? parseInt(a.numero) - parseInt(b.numero)
        : parseInt(b.numero) - parseInt(a.numero);
    }
    
    if (a[sortField] < b[sortField]) return sortDirection === 'asc' ? -1 : 1;
    if (a[sortField] > b[sortField]) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentData = sortedData.slice(startIndex, startIndex + itemsPerPage);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('fr-FR');
    } catch (e) {
      return dateString;
    }
  };

  const getPositionClass = (position: string) => {
    switch (position) {
      case 'pour': return 'bg-green-100 text-green-800';
      case 'contre': return 'bg-red-100 text-red-800';
      case 'abstention': return 'bg-orange-100 text-orange-800';
      case 'absent': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const handleExport = () => {
    // Get the deputy name for the filename - using a placeholder if not available
    const deputyName = 'depute';
    exportToCSV(data, deputyName);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>Votes du député</span>
          {data.length > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExport}
              className="flex items-center"
            >
              <Download className="h-4 w-4 mr-2" />
              Exporter CSV
            </Button>
          )}
        </CardTitle>
        <CardDescription>
          {data.length > 0 
            ? `${data.length} votes au total` 
            : "Aucun vote trouvé pour ce député"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : data.length > 0 ? (
          <>
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px] cursor-pointer" onClick={() => handleSort('numero')}>
                      <div className="flex items-center">
                        N°
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('dateScrutin')}>
                      <div className="flex items-center">
                        Date
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead>Titre</TableHead>
                    <TableHead className="w-[120px] cursor-pointer" onClick={() => handleSort('position')}>
                      <div className="flex items-center">
                        Position
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentData.map((vote, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono">{vote.numero}</TableCell>
                      <TableCell>{formatDate(vote.dateScrutin)}</TableCell>
                      <TableCell>
                        {vote.title.length > 100 
                          ? `${vote.title.substring(0, 100)}...` 
                          : vote.title}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPositionClass(vote.position)}`}>
                          {vote.position.charAt(0).toUpperCase() + vote.position.slice(1)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Précédent
                </Button>
                <span className="text-sm text-gray-500">
                  Page {currentPage} sur {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  Suivant
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="py-8 text-center text-gray-500">
            Aucun vote à afficher
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VotesTable;
