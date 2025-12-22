import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const steps = [
  {
    number: "01",
    title: "Book a Call",
    description: "We'll discuss your goals, niche, and which plan fits.",
  },
  {
    number: "02",
    title: "We Get to Work",
    description: "Researching, pitching, and booking shows that match your expertise.",
  },
  {
    number: "03",
    title: "You Show Up",
    description: "We handle prep, coordination, and content.",
  },
  {
    number: "04",
    title: "Your Authority Grows",
    description: "Consistently, month after month.",
  },
];

const HowItWorksSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section id="how-it-works" className="py-8 md:py-16 bg-surface-subtle">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-16">
            How It Works
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div
                key={index}
                className="relative"
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <div className="text-5xl font-bold text-muted/50 mb-4">
                  {step.number}
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {step.title}
                </h3>
                <p className="text-muted-foreground">
                  {step.description}
                </p>
                
                {/* Connector line for desktop */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-8 left-full w-full h-px bg-border -translate-x-4" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
