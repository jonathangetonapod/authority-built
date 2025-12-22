import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const plans = [
  {
    name: "Starter",
    price: "$1,000",
    period: "/month",
    features: [
      "2 podcasts/month",
      "Guest prep kit",
      "Content package",
      "Monthly report",
    ],
    popular: false,
  },
  {
    name: "Growth",
    price: "$2,000",
    period: "/month",
    features: [
      "4 podcasts/month",
      "Guest prep kit",
      "Content package",
      "Monthly report",
    ],
    popular: true,
  },
  {
    name: "Pro",
    price: "$4,000",
    period: "/month",
    features: [
      "4 podcasts/month + PR",
      "Everything in Growth, plus:",
      "Done-for-you PR outreach",
      "2-3 media angles monthly",
      "Custom media list",
      "Monthly strategy call",
    ],
    popular: false,
  },
];

const PricingSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section id="pricing" className="py-8 md:py-16 bg-surface-subtle">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-16">
            Choose Your Plan
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan, index) => (
              <div
                key={index}
                className={`relative p-8 rounded-xl border transition-all duration-300 ${
                  plan.popular
                    ? 'bg-primary text-primary-foreground border-primary scale-105'
                    : 'bg-background border-border hover:border-foreground/20'
                }`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-background text-foreground text-xs font-semibold rounded-full">
                    Most Popular
                  </div>
                )}
                
                <h3 className={`text-xl font-semibold mb-2 ${
                  plan.popular ? 'text-primary-foreground' : 'text-foreground'
                }`}>
                  {plan.name}
                </h3>
                
                <div className="mb-6">
                  <span className={`text-4xl font-bold ${
                    plan.popular ? 'text-primary-foreground' : 'text-foreground'
                  }`}>
                    {plan.price}
                  </span>
                  <span className={plan.popular ? 'text-primary-foreground/70' : 'text-muted-foreground'}>
                    {plan.period}
                  </span>
                </div>
                
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                        plan.popular ? 'text-primary-foreground' : 'text-foreground'
                      }`} />
                      <span className={plan.popular ? 'text-primary-foreground/90' : 'text-muted-foreground'}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                
                <Button
                  variant={plan.popular ? 'secondary' : 'hero'}
                  size="lg"
                  className="w-full"
                  asChild
                >
                  <a href="#book">Book a Call</a>
                </Button>
              </div>
            ))}
          </div>
          
          <p className="text-center text-muted-foreground mt-8">
            All plans require a 3-month minimum commitment.
          </p>
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
