import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Calendar, FileText, Video, BarChart3, CheckCircle2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const features = [
  {
    icon: Calendar,
    title: "Done-For-You Placements",
    description: "We handle everything from discovery to booking—you just show up.",
    items: [
      "Custom podcast research & targeting",
      "Personalized pitch writing",
      "Persistent follow-up until yes",
      "Full calendar coordination"
    ],
    color: "from-blue-500/20 to-blue-600/20",
    badge: "Zero Effort"
  },
  {
    icon: FileText,
    title: "Guest Prep Kit",
    description: "Show up confident and ready to deliver value to every audience.",
    items: [
      "Host & show research brief",
      "Talking points tailored to audience",
      "Pre-interview prep notes",
      "Key questions to expect"
    ],
    color: "from-purple-500/20 to-purple-600/20",
    badge: "Included"
  },
  {
    icon: Video,
    title: "Content Package",
    description: "Maximize every appearance with ready-to-post promotional assets.",
    items: [
      "3 short-form video clips",
      "1 audiogram for social",
      "2 quote graphics",
      "Optimized for LinkedIn & Twitter"
    ],
    color: "from-green-500/20 to-green-600/20",
    badge: "After Every Episode"
  },
  {
    icon: BarChart3,
    title: "Monthly Report",
    description: "Track your growth with clear metrics and insights every month.",
    items: [
      "Shows booked and aired",
      "Total audience reach",
      "Content performance metrics",
      "Next month's pipeline"
    ],
    color: "from-orange-500/20 to-orange-600/20",
    badge: "Monthly"
  },
];

const WhatYouGetSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section className="py-8 md:py-16 bg-background">
      <div className="container mx-auto px-4">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          {/* Header */}
          <div className="text-center mb-12 md:mb-16">
            <div className="inline-flex items-center gap-2 mb-4">
              <Sparkles className="w-6 h-6 text-primary" />
              <Badge variant="outline" className="text-sm">
                Everything Included
              </Badge>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              What You Get
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Every plan includes our complete white-glove service—from booking to content delivery.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-6xl mx-auto">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="group relative bg-background rounded-2xl border-2 border-border p-6 md:p-8 hover:border-primary/50 transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  {/* Badge */}
                  <div className="absolute -top-3 right-6">
                    <Badge className="bg-primary/10 text-primary border-primary/20">
                      {feature.badge}
                    </Badge>
                  </div>

                  {/* Icon */}
                  <div className="mb-6">
                    <div className={`inline-flex w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br ${feature.color} items-center justify-center`}>
                      <Icon className="w-7 h-7 md:w-8 md:h-8 text-foreground" strokeWidth={1.5} />
                    </div>
                  </div>

                  {/* Content */}
                  <h3 className="text-2xl md:text-2xl font-bold text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    {feature.description}
                  </p>

                  {/* Items List */}
                  <ul className="space-y-2.5">
                    {feature.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-3 text-foreground">
                        <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-sm md:text-base">{item}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Hover Indicator */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/0 via-primary to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity rounded-b-2xl" />
                </div>
              );
            })}
          </div>

          {/* Bottom Note */}
          <div className="text-center mt-12 md:mt-16">
            <p className="text-lg text-muted-foreground">
              <span className="font-semibold text-foreground">Pro clients</span> also get dedicated PR outreach, custom media lists, and monthly strategy calls.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhatYouGetSection;
