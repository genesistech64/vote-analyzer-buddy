
import React from 'react';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { History } from 'lucide-react';
import { toast } from 'sonner';

// Define available legislatures
const LEGISLATURES = [
  { id: "17", label: "17e législature (2022-2027)", period: "2022-2027" },
  { id: "16", label: "16e législature (2017-2022)", period: "2017-2022" },
  { id: "15", label: "15e législature (2012-2017)", period: "2012-2017" },
  { id: "14", label: "14e législature (2007-2012)", period: "2007-2012" },
];

export const getCurrentLegislature = (): string => {
  return "17"; // Default to current legislature (17th)
};

interface LegislatureSelectorProps {
  selectedLegislature: string;
  onSelectLegislature: (legislature: string) => void;
}

const LegislatureSelector: React.FC<LegislatureSelectorProps> = ({ 
  selectedLegislature, 
  onSelectLegislature 
}) => {
  const handleLegislatureChange = (legislatureId: string) => {
    onSelectLegislature(legislatureId);
    const legislature = LEGISLATURES.find(l => l.id === legislatureId);
    
    toast.info(
      `Législature modifiée`, 
      { description: `Vous consultez maintenant la ${legislatureId}e législature (${legislature?.period || ''})` }
    );
  };

  return (
    <div className="flex items-center space-x-2">
      <History className="h-4 w-4 text-white/70" />
      <Select value={selectedLegislature} onValueChange={handleLegislatureChange}>
        <SelectTrigger 
          className="w-[180px] bg-transparent border-none text-white text-sm focus:ring-0 focus:ring-offset-0"
        >
          <SelectValue placeholder="Sélectionner une législature" />
        </SelectTrigger>
        <SelectContent>
          {LEGISLATURES.map((legislature) => (
            <SelectItem key={legislature.id} value={legislature.id}>
              {legislature.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default LegislatureSelector;
