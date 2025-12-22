import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import ProblemSection from '@/components/ProblemSection';
import SolutionSection from '@/components/SolutionSection';
import HowItWorksSection from '@/components/HowItWorksSection';
import WhatYouGetSection from '@/components/WhatYouGetSection';
import PodcastShowcaseSection from '@/components/PodcastShowcaseSection';
import PricingSection from '@/components/PricingSection';
import WhyProSection from '@/components/WhyProSection';
import WhoItsForSection from '@/components/WhoItsForSection';
import SocialProofSection from '@/components/SocialProofSection';
import LeadMagnetSection from '@/components/LeadMagnetSection';
import FAQSection from '@/components/FAQSection';
import FinalCTASection from '@/components/FinalCTASection';
import Footer from '@/components/Footer';
import { SocialProofNotifications } from '@/components/SocialProofNotifications';

const Index = () => {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <ProblemSection />
      <SolutionSection />
      <HowItWorksSection />
      <WhatYouGetSection />
      <PodcastShowcaseSection />
      <PricingSection />
      <WhyProSection />
      <WhoItsForSection />
      <SocialProofSection />
      <LeadMagnetSection />
      <FAQSection />
      <FinalCTASection />
      <Footer />
      <SocialProofNotifications />
    </main>
  );
};

export default Index;
