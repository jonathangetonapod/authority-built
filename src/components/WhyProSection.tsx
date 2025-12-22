import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const WhyProSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section className="py-8 md:py-16">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`max-w-3xl mx-auto text-center transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
            Why Pro?
          </h2>
          
          <div className="text-lg md:text-xl text-muted-foreground leading-relaxed space-y-6 text-left">
            <p>
              <span className="text-foreground font-medium">Podcasts build your audience. Press builds your credibility.</span>{' '}
              Pro gives you both.
            </p>
            
            <p>
              Every month, we develop 2-3 media angles tailored to your expertise—the kind 
              journalists actually want to cover. Then we pitch on your behalf to publications 
              in your niche.
            </p>
            
            <p>
              Plus, you get a monthly strategy call where we review what's working, refine 
              your angles, and plan your growth together.
            </p>
            
            <p className="text-foreground font-medium">
              You don't just show up on podcasts. You show up everywhere.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhyProSection;
