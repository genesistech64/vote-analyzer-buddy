
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import DeputyProfile from "./pages/DeputyProfile";
import NotFound from "./pages/NotFound";
import About from "./pages/About";
import OrganeMembers from "./pages/OrganeMembers";
import VoteDetails from "./pages/VoteDetails";
import GroupeDetails from "./pages/GroupeDetails";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/deputy/:deputyId" element={<DeputyProfile />} />
          <Route path="/about" element={<About />} />
          <Route path="/organe/:organeId/:organeNom/:organeType" element={<OrganeMembers />} />
          <Route path="/votes/:legislature/:voteId" element={<VoteDetails />} />
          <Route path="/groupes/:groupeId" element={<GroupeDetails />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
