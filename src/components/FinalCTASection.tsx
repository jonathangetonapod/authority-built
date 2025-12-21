import { Button } from '@/components/ui/button';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const FinalCTASection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section id="book" className="py-20 md:py-32 bg-primary text-primary-foreground">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`max-w-3xl mx-auto text-center transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            Ready to Stop Being a Secret?
          </h2>
          
          <p className="text-xl text-primary-foreground/80 mb-10">
            Book a call to see if Authority Lab is right for you.
          </p>
          
          <Button
            variant="secondary"
            size="xl"
            className="shadow-lg"
            asChild
          >
            <a href="#book">Book Your Call</a>
          </Button>
          
          <p className="text-sm text-primary-foreground/60 mt-6">
            No pitch. No pressure. Just a conversation to see if we're a fit.
          </p>
        </div>
      </div>
    </section>
  );
};

export default FinalCTASection;
