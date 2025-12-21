import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const faqs = [
  {
    question: "What kind of podcasts will I be on?",
    answer: "We focus on podcasts that match your expertise, target audience, and business goals. This includes industry-specific shows, entrepreneurship podcasts, and niche shows where your ideal clients are listening.",
  },
  {
    question: "How fast will I get booked?",
    answer: "Most clients see their first bookings within 2-4 weeks of starting. The timeline depends on your niche, the type of shows you're targeting, and host availability.",
  },
  {
    question: "What's the difference between Growth and Pro?",
    answer: "Growth focuses on podcast placements and content creation. Pro adds strategic content repurposing — LinkedIn posts, blog articles, and a monthly strategy call to maximize the impact of each appearance.",
  },
  {
    question: "What happens on the monthly strategy call?",
    answer: "We review your podcast performance, discuss upcoming bookings, refine your messaging based on what's working, and plan content strategy for the coming month.",
  },
  {
    question: "Why the 3-month minimum?",
    answer: "Building authority takes consistent effort. The 3-month minimum ensures you have enough time to see real results — multiple appearances, content momentum, and measurable audience growth.",
  },
  {
    question: "What are Premium Placements?",
    answer: "Premium Placements are top-tier podcasts with larger audiences and higher production value. These require more extensive pitching and relationship building, which is why they're included in higher-tier plans.",
  },
  {
    question: "Can I upgrade my plan later?",
    answer: "Absolutely. You can upgrade at any time. We'll prorate the difference and immediately start working on the additional deliverables.",
  },
];

const FAQSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section id="faq" className="py-20 md:py-32">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`max-w-3xl mx-auto transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-12">
            Questions
          </h2>
          
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border-border">
                <AccordionTrigger className="text-left text-foreground hover:no-underline hover:text-foreground/80">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
