
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { getGroupePolitiqueCouleur } from '@/utils/types';
import { Link } from 'react-router-dom';

interface PoliticalGroupBadgeProps {
  groupe?: string;
  groupeId?: string;
  onClick?: () => void;
  className?: string;
  linkToMembers?: boolean;
}

const PoliticalGroupBadge: React.FC<PoliticalGroupBadgeProps> = ({ 
  groupe, 
  groupeId,
  onClick, 
  className = "",
  linkToMembers = false
}) => {
  if (!groupe) return null;
  
  const couleur = getGroupePolitiqueCouleur(groupe);
  const badgeStyle = { 
    backgroundColor: couleur,
    color: isLightColor(couleur) ? '#000' : '#fff',
    borderColor: 'transparent'
  };
  
  // Render as link if linkToMembers is true and groupeId is provided
  if (linkToMembers && groupeId) {
    return (
      <Link 
        to={`/organe/${groupeId}/${encodeURIComponent(groupe)}/${encodeURIComponent('GP')}`}
        className="inline-block"
      >
        <Badge 
          variant="outline" 
          className={`${className} cursor-pointer hover:bg-opacity-90 transition-colors`} 
          style={badgeStyle}
        >
          {groupe}
        </Badge>
      </Link>
    );
  }
  
  // Standard badge without link
  return (
    <Badge 
      variant="outline" 
      className={`${className} ${onClick ? 'cursor-pointer' : ''} hover:bg-opacity-90 transition-colors`} 
      onClick={onClick}
      style={badgeStyle}
    >
      {groupe}
    </Badge>
  );
};

// Function to determine if a color is light (to choose text color)
function isLightColor(hexColor: string): boolean {
  // Convert hex color to RGB
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  
  // Calculate brightness (standard YIQ formula)
  const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  
  // If luminance is greater than 0.5, it's a light color
  return luminance > 0.5;
}

export default PoliticalGroupBadge;
