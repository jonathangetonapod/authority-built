import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import ProblemSection from '@/components/ProblemSection';
import SolutionSection from '@/components/SolutionSection';
import HowItWorksSection from '@/components/HowItWorksSection';
import WhatYouGetSection from '@/components/WhatYouGetSection';
import PodcastShowcaseSection from '@/components/PodcastShowcaseSection';
import WhoItsForSection from '@/components/WhoItsForSection';
import PricingSection from '@/components/PricingSection';
import GuaranteeSection from '@/components/GuaranteeSection';
import SocialProofSection from '@/components/SocialProofSection';
import FAQSection from '@/components/FAQSection';
import FinalCTASection from '@/components/FinalCTASection';
import Footer from '@/components/Footer';
import PageSEO from '@/components/seo/PageSEO';

const Index = () => {
  return (
    <main className="homepage-shell min-h-screen bg-transparent text-[#0d1b2a]">
      <PageSEO
        title="Get booked on podcasts your buyers already trust | Get On A Pod"
        description="Done-for-you podcast booking for founders, advisors, and operators. Approve the shortlist, see the outreach, and track every booking in one client portal."
        path="/podcast-booking"
      />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-[#0d1b2a] focus:px-4 focus:py-2 focus:text-sm focus:text-[#f7fafc]"
      >
        Skip to content
      </a>
      <Navbar />
      <div id="main-content" className="relative">
        <HeroSection />
        <PodcastShowcaseSection />
        <ProblemSection />
        <SolutionSection />
        <WhoItsForSection />
        <HowItWorksSection />
        <WhatYouGetSection />
        <SocialProofSection />
        <PricingSection />
        <GuaranteeSection />
        <FAQSection />
        <FinalCTASection />
        <Footer />
      </div>
    </main>
  );
};

export default Index;
