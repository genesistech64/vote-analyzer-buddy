
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { getGroupePolitiqueCouleur } from '@/utils/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface PoliticalGroupBadgeProps {
  groupe?: string;
  onClick?: () => void;
  className?: string;
  showTooltip?: boolean;
  tooltipContent?: string;
}

const PoliticalGroupBadge: React.FC<PoliticalGroupBadgeProps> = ({ 
  groupe, 
  onClick, 
  className = "",
  showTooltip = false,
  tooltipContent
}) => {
  if (!groupe) return null;
  
  const couleur = getGroupePolitiqueCouleur(groupe);
  const displayContent = (
    <Badge 
      variant="outline" 
      className={`${className} cursor-pointer hover:bg-opacity-90 transition-colors`} 
      onClick={onClick}
      style={{ 
        backgroundColor: couleur,
        color: isLightColor(couleur) ? '#000' : '#fff',
        borderColor: 'transparent'
      }}
    >
      {groupe}
    </Badge>
  );
  
  // Si showTooltip est true, on enveloppe le badge dans un Tooltip
  if (showTooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {displayContent}
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltipContent || groupe}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  // Sinon, on retourne simplement le badge
  return displayContent;
};

// Fonction pour déterminer si une couleur est claire (pour choisir la couleur du texte)
function isLightColor(hexColor: string): boolean {
  // Convertir la couleur hexadécimale en RGB
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  
  // Calculer la luminosité (formule standard YIQ)
  const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  
  // Si la luminosité est supérieure à 0.5, c'est une couleur claire
  return luminance > 0.5;
}

export default PoliticalGroupBadge;
