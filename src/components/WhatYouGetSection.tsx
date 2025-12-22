import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Calendar, FileText, Video, BarChart3 } from 'lucide-react';

const features = [
  {
    icon: Calendar,
    title: "Done-For-You Placements",
    items: ["Research, pitching, follow-up, booking", "Calendar coordination"],
  },
  {
    icon: FileText,
    title: "Guest Prep Kit",
    items: [
      "Host & show research brief",
      "Talking points tailored to audience",
      "Pre-interview prep notes",
    ],
  },
  {
    icon: Video,
    title: "Content Package",
    items: ["3 short-form video clips", "1 audiogram", "2 quote graphics"],
  },
  {
    icon: BarChart3,
    title: "Monthly Report",
    items: ["Shows booked and aired", "Audience reach", "Content performance"],
  },
];

const WhatYouGetSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section className="py-8 md:py-16">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-16">
            What You Get
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="p-8 bg-surface-subtle rounded-xl border border-border hover:border-foreground/20 transition-all duration-300"
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <feature.icon className="w-10 h-10 text-foreground mb-6" strokeWidth={1.5} />
                <h3 className="text-xl font-semibold text-foreground mb-4">
                  {feature.title}
                </h3>
                <ul className="space-y-2">
                  {feature.items.map((item, i) => (
                    <li key={i} className="text-muted-foreground">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhatYouGetSection;
