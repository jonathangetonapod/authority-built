import { Button } from '@/components/ui/button';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const SolutionSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section className="py-20 md:py-32">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`max-w-3xl mx-auto text-center transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            The Solution
          </p>
          
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6">
            What If Someone Did It For You?
          </h2>
          
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed mb-10">
            Authority Lab handles everything — researching shows, writing pitches, 
            following up, booking interviews, and coordinating your calendar. 
            You pick a plan. We book the shows. You show up and talk.
          </p>
          
          <Button variant="hero" size="lg" asChild>
            <a href="#how-it-works">See How It Works</a>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default SolutionSection;
