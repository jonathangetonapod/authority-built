import { X } from 'lucide-react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const painPoints = [
  "You spend hours researching podcasts and publications",
  "You craft the perfect pitch... and hear nothing back",
  "You follow up. Still nothing.",
  "Months go by. Your competitors keep showing up everywhere.",
  "You stay the best-kept secret in your industry.",
];

const ProblemSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section className="py-8 md:py-16 bg-surface-subtle">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`max-w-3xl mx-auto transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            The Problem
          </p>
          
          <p className="text-xl md:text-2xl text-foreground leading-relaxed mb-12">
            You know visibility works. You've seen competitors build authority, 
            generate leads, and close deals—all from being on the right podcasts 
            and getting featured in the right publications.
          </p>
          
          <div className="space-y-4">
            {painPoints.map((point, index) => (
              <div
                key={index}
                className={`flex items-start gap-4 p-4 bg-background rounded-lg border border-border transition-all duration-500`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-destructive/10 flex items-center justify-center">
                  <X className="w-4 h-4 text-destructive" />
                </div>
                <p className="text-foreground">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProblemSection;
