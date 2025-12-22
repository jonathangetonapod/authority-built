import { Button } from '@/components/ui/button';

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-24 pb-16 md:pt-20 md:pb-24 px-4">
      <div className="container mx-auto text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="animate-fade-up text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.2] sm:leading-tight mb-6 px-2">
            Get Booked on Podcasts.
            <br />
            Get Featured in Press.
            <br />
            <span className="text-muted-foreground">Without Pitching Yourself.</span>
          </h1>

          <p className="animate-fade-up animation-delay-100 text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed px-4">
            Done-for-you podcast placement and PR for founders and financial professionals.
            Show up. Talk. Let us handle the rest.
          </p>

          <div className="animate-fade-up animation-delay-200 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4">
            <Button variant="hero" size="xl" className="w-full sm:w-auto min-h-[48px] text-base" asChild>
              <a href="#book">Book a Call</a>
            </Button>
            <Button variant="heroOutline" size="xl" className="w-full sm:w-auto min-h-[48px] text-base" asChild>
              <a href="#lead-magnet">Get the Free Podcast List</a>
            </Button>
          </div>
        </div>
      </div>
      
      {/* Subtle gradient background */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-gradient-radial from-muted/50 to-transparent rounded-full blur-3xl" />
      </div>
    </section>
  );
};

export default HeroSection;
