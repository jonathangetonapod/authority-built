import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Shield, CheckCircle2, Target, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const guarantees = [
  {
    icon: Shield,
    title: "We Work Until You're Booked",
    description: "We don't stop working until you get the podcast placements we promised. If we don't hit the number in your agreed timeframe, we keep working for free until we do."
  },
  {
    icon: Target,
    title: "Results-Guaranteed Service",
    description: "You get the exact number of podcast placements promised in your plan. If we fall short, we continue working at no additional cost until we deliver."
  },
  {
    icon: Zap,
    title: "No Excuses, Just Results",
    description: "Time limit expires before we hit your number? We keep pitching, booking, and coordinating—completely free—until every promised placement is secured."
  }
];

const GuaranteeSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section className="py-8 md:py-16 bg-gradient-to-b from-primary/5 via-background to-background" id="guarantee">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          {/* Header */}
          <div className="text-center mb-12">
            <Badge className="mb-4 bg-success/10 text-success border-success/20">
              Results Guaranteed
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">
              Our Iron-Clad Guarantee
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              You get every podcast placement we promise—no matter how long it takes us to deliver.
            </p>
          </div>

          {/* Guarantee Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-12">
            {guarantees.map((guarantee, index) => {
              const Icon = guarantee.icon;
              return (
                <div
                  key={index}
                  className="relative bg-background rounded-2xl border-2 border-border p-8 hover:border-primary/50 transition-all duration-300 hover:shadow-xl"
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  {/* Icon */}
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 mb-6">
                    <Icon className="h-8 w-8 text-primary" />
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-bold text-foreground mb-3">
                    {guarantee.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {guarantee.description}
                  </p>

                  {/* Checkmark */}
                  <div className="absolute top-6 right-6">
                    <CheckCircle2 className="h-6 w-6 text-success" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Trust Badge */}
          <div className="max-w-3xl mx-auto text-center p-8 bg-gradient-to-r from-primary/10 via-purple-500/10 to-primary/10 rounded-2xl border-2 border-primary/20">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Shield className="h-10 w-10 text-primary" />
              <h3 className="text-2xl md:text-3xl font-bold text-foreground">
                If We Don't Hit Your Number, We Work For Free
              </h3>
            </div>
            <p className="text-lg text-muted-foreground mb-6">
              Miss the deadline? We keep going—for free—until every promised placement is delivered. You paid for X podcasts, you get X podcasts. Period.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span>Get every placement promised</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span>We work free until delivered</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span>No excuses, just results</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default GuaranteeSection;
