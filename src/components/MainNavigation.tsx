
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { BarChart3, HelpCircle, Home } from 'lucide-react';

const MainNavigation = () => {
  const location = useLocation();
  
  return (
    <div className="bg-[#003366] shadow-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <NavigationMenu className="mx-auto">
          <NavigationMenuList>
            <NavigationMenuItem>
              <Link to="/">
                <NavigationMenuLink 
                  className={cn(
                    navigationMenuTriggerStyle(),
                    "bg-transparent text-white hover:bg-[#002347] hover:text-white",
                    location.pathname === '/' && "bg-[#002347]"
                  )}
                >
                  <Home className="mr-2 h-4 w-4" />
                  Accueil
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
            
            <NavigationMenuItem>
              <Link to="/about">
                <NavigationMenuLink 
                  className={cn(
                    navigationMenuTriggerStyle(),
                    "bg-transparent text-white hover:bg-[#002347] hover:text-white",
                    location.pathname === '/about' && "bg-[#002347]"
                  )}
                >
                  <HelpCircle className="mr-2 h-4 w-4" />
                  À propos
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </div>
    </div>
  );
};

export default MainNavigation;
