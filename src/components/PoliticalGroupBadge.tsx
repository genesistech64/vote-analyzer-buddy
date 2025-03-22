
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { getGroupePolitiqueCouleur } from '@/utils/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PoliticalGroupBadgeProps {
  groupe?: string;
  groupeUid?: string;
  onClick?: () => void;
  className?: string;
  showTooltip?: boolean;
  tooltipContent?: string;
  showMembersIcon?: boolean;
  navigateToGroup?: boolean;
}

const PoliticalGroupBadge: React.FC<PoliticalGroupBadgeProps> = ({ 
  groupe, 
  groupeUid,
  onClick, 
  className = "",
  showTooltip = false,
  tooltipContent,
  showMembersIcon = false,
  navigateToGroup = false
}) => {
  const navigate = useNavigate();

  if (!groupe) return null;
  
  const couleur = getGroupePolitiqueCouleur(groupe);
  
  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (navigateToGroup && groupeUid) {
      navigate(`/group/${groupeUid}/${encodeURIComponent(groupe)}`);
    }
  };

  const displayContent = (
    <Badge 
      variant="outline" 
      className={`${className} cursor-pointer hover:bg-opacity-90 transition-colors flex items-center gap-1`} 
      onClick={handleClick}
      style={{ 
        backgroundColor: couleur,
        color: isLightColor(couleur) ? '#000' : '#fff',
        borderColor: 'transparent'
      }}
    >
      {showMembersIcon && <Users className="h-3 w-3" />}
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
            <p>{tooltipContent || (showMembersIcon ? `Voir tous les députés du groupe ${groupe}` : groupe)}</p>
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
