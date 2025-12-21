import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import ProblemSection from '@/components/ProblemSection';
import SolutionSection from '@/components/SolutionSection';
import HowItWorksSection from '@/components/HowItWorksSection';
import WhatYouGetSection from '@/components/WhatYouGetSection';
import PricingSection from '@/components/PricingSection';
import WhoItsForSection from '@/components/WhoItsForSection';
import SocialProofSection from '@/components/SocialProofSection';
import LeadMagnetSection from '@/components/LeadMagnetSection';
import FAQSection from '@/components/FAQSection';
import FinalCTASection from '@/components/FinalCTASection';
import Footer from '@/components/Footer';

const Index = () => {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <ProblemSection />
      <SolutionSection />
      <HowItWorksSection />
      <WhatYouGetSection />
      <PricingSection />
      <WhoItsForSection />
      <SocialProofSection />
      <LeadMagnetSection />
      <FAQSection />
      <FinalCTASection />
      <Footer />
    </main>
  );
};

export default Index;
