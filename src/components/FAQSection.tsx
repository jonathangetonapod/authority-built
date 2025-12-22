import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const faqCategories = [
  {
    category: "Podcasts & Booking",
    faqs: [
      {
        question: "What kind of podcasts will I be on?",
        answer: "Shows that match your niche and have engaged audiences. We vet every show for quality and relevance before pitching you.",
      },
      {
        question: "What size podcasts will I be on?",
        answer: "It varies. We focus on relevance over size. A niche podcast with 5,000 engaged listeners in your industry is often more valuable than a general show with 50,000.",
      },
      {
        question: "How fast will I get booked?",
        answer: "Most clients see their first booking within 2-4 weeks. Episodes typically air 4-8 weeks after recording.",
      },
      {
        question: "Can I approve shows before you pitch me?",
        answer: "Yes. We'll share our target list with you upfront, and you can veto any shows that don't feel like a fit.",
      },
    ],
  },
  {
    category: "PR & Media (Pro Tier)",
    faqs: [
      {
        question: "What's included in the PR outreach?",
        answer: "We develop 2-3 pitchable angles each month based on your expertise and current trends. Then we build a media list of relevant publications, journalists, and contributors—and pitch them on your behalf.",
      },
      {
        question: "What's a 'media angle'?",
        answer: "A media angle is a newsworthy hook that makes journalists want to cover you. It could be a contrarian take, a timely insight, a data-backed trend, or a compelling personal story. We help you find and package these.",
      },
      {
        question: "Do you guarantee press placements?",
        answer: "No—journalists make their own decisions. What we guarantee is the work: developing strong angles, building your media list, and pitching on your behalf consistently. Most Pro clients see 1-3 media mentions per quarter.",
      },
    ],
  },
  {
    category: "Pricing & Logistics",
    faqs: [
      {
        question: "What's the difference between Growth and Pro?",
        answer: "Growth gives you 4 podcast placements per month with all the prep and content. Pro adds done-for-you PR: we develop media angles, build your target publication list, and pitch journalists on your behalf. Plus a monthly strategy call to review and plan.",
      },
      {
        question: "Why the 3-month minimum?",
        answer: "Authority isn't built in 30 days. Podcast episodes take time to book, record, and air. PR takes time to land. The 3-month minimum ensures you see real results and build momentum.",
      },
      {
        question: "What happens on the monthly strategy call?",
        answer: "We review your placement metrics, content performance, and PR outreach results. Then we map out the next month—which shows to target, what angles to pitch, and how to maximize your authority.",
      },
      {
        question: "Can I upgrade or downgrade my plan?",
        answer: "Yes. You can move between plans at any time after your initial 3 months.",
      },
      {
        question: "What are Premium Placements?",
        answer: "Guaranteed spots on specific podcasts from our curated menu. You pick the show, we book it. Priced per placement. Ask about the menu on your call.",
      },
    ],
  },
];

const FAQSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section id="faq" className="py-8 md:py-16">
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
          
          <div className="space-y-10">
            {faqCategories.map((category, categoryIndex) => (
              <div key={categoryIndex}>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                  {category.category}
                </h3>
                
                <Accordion type="single" collapsible className="w-full">
                  {category.faqs.map((faq, index) => (
                    <AccordionItem 
                      key={index} 
                      value={`${categoryIndex}-${index}`} 
                      className="border-border"
                    >
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
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
