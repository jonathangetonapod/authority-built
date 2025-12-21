import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const testimonials = [
  {
    quote: "Authority Lab helped me land 12 podcast appearances in 3 months. My inbound leads have tripled since.",
    name: "Sarah Chen",
    title: "Founder & CEO",
    company: "TechStart Ventures",
  },
  {
    quote: "I hated self-promotion. Now I just show up to interviews fully prepped and let the content do the work.",
    name: "Michael Torres",
    title: "Managing Partner",
    company: "Torres Wealth Advisory",
  },
  {
    quote: "The content package alone is worth the investment. Every episode generates weeks of social content.",
    name: "Emily Watson",
    title: "CFO",
    company: "GrowthScale Inc",
  },
];

const SocialProofSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section className="py-20 md:py-32 bg-surface-subtle">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-16">
            Trusted By
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="p-8 bg-background rounded-xl border border-border"
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <blockquote className="text-lg text-foreground mb-6">
                  "{testimonial.quote}"
                </blockquote>
                <div>
                  <p className="font-semibold text-foreground">{testimonial.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {testimonial.title}, {testimonial.company}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SocialProofSection;
