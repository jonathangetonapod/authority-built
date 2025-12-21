import { Check, X } from 'lucide-react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const forYou = [
  "Founders who want to be seen as the authority in their space",
  "Financial professionals who need credibility and visibility",
  "Tech executives who hate self-promotion but need exposure",
  "Anyone tired of being the best-kept secret in their industry",
];

const notForYou = [
  "People who aren't ready to show up and deliver value",
  "Anyone looking for vanity metrics instead of real authority",
  "Businesses without a clear message or expertise to share",
];

const WhoItsForSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section className="py-20 md:py-32">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`grid grid-cols-1 md:grid-cols-2 gap-12 max-w-5xl mx-auto transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          {/* Who This Is For */}
          <div>
            <h3 className="text-2xl font-bold text-foreground mb-8">
              Who This Is For
            </h3>
            <ul className="space-y-4">
              {forYou.map((item, index) => (
                <li key={index} className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-success/10 flex items-center justify-center mt-0.5">
                    <Check className="w-4 h-4 text-success" />
                  </div>
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Who This Is NOT For */}
          <div>
            <h3 className="text-2xl font-bold text-foreground mb-8">
              Who This Is NOT For
            </h3>
            <ul className="space-y-4">
              {notForYou.map((item, index) => (
                <li key={index} className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-destructive/10 flex items-center justify-center mt-0.5">
                    <X className="w-4 h-4 text-destructive" />
                  </div>
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhoItsForSection;
