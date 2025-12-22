import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Shield, CheckCircle2, Target, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const guarantees = [
  {
    icon: Shield,
    title: "We Work Until You're Booked",
    description: "We don't stop working until you get the podcast placements we promised. Your success is literally our business model."
  },
  {
    icon: Target,
    title: "Pay Only When We Deliver",
    description: "You only pay once we've secured your bookings. No upfront fees, no payment until results are in hand."
  },
  {
    icon: Zap,
    title: "Zero Risk to You",
    description: "If we can't deliver your placements, you don't pay a cent. We put in the work for free until we get you results."
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
              100% Risk-Free
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">
              Our Iron-Clad Guarantee
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              We're so confident in our ability to get you booked that we put our money where our mouth is.
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
                We Don't Get Paid Until You Get Results
              </h3>
            </div>
            <p className="text-lg text-muted-foreground mb-6">
              That's right—we work for free until we deliver your promised podcast placements. No upfront payment. No risk to you. We only succeed when you succeed.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span>No payment until delivery</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span>We work for free until results</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span>100% performance-based</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default GuaranteeSection;
