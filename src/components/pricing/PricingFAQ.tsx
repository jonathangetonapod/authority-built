/**
 * The marketing site's FAQ copy. It speaks for Get On A Pod — price, guarantee,
 * compliance position — so it belongs on our own pages only, and deliberately
 * not on the white-label prospect dashboard, which answers in the agency's voice.
 *
 * FAQSection renders it. The accordion component that used to live here went
 * with its last caller.
 */
export const faqCategories = [
  {
    category: "Fit & Booking",
    faqs: [
      {
        question: "What kind of podcasts will I be on?",
        answer: "We target shows based on your expertise, audience fit, topic match, host quality, and whether the format actually supports guest conversations. The goal is relevance and trust, not random appearances.",
      },
      {
        question: "Do you prioritize big podcasts or the right podcasts?",
        answer: "We prioritize audience fit over vanity rankings. A smaller, buyer-relevant show is often more valuable than a larger podcast with weak alignment to your market.",
      },
      {
        question: "How fast will I get booked?",
        answer: "Most clients see their first booking within 2 to 4 weeks, depending on positioning, show approval speed, and the responsiveness of hosts. Publish dates usually trail recordings by several weeks.",
      },
      {
        question: "Can I approve shows before you pitch them?",
        answer: "Yes. Your portal shows the podcasts we recommend, why they fit, and where they sit in the workflow. We only pitch the shows you approve.",
      },
      {
        question: "Is this earned outreach or paid placement?",
        answer: "The core service focuses on earned outreach, where hosts or producers decide to book you. Premium paid placements can be offered separately as an add-on when appropriate.",
      },
    ],
  },
  {
    category: "Platform & Process",
    faqs: [
      {
        question: "What is the Podcast Command Center?",
        answer: "It is your private client portal. You can review recommended shows, approve outreach targets, track statuses, see recording dates, and follow each opportunity through publication without relying on spreadsheet updates.",
      },
      {
        question: "How does the AI analysis work?",
        answer: "AI helps score fit, summarize audience and topic alignment, and surface useful pitch angles. Human review still matters, so recommendations are filtered through real campaign judgment before outreach starts.",
      },
      {
        question: "What's included in reporting & analytics?",
        answer: "You can see what is pitched, booked, recorded, publishing, and live, along with the links and dates tied to each stage. The point is operational clarity, not vanity dashboards.",
      },
      {
        question: "Do you write the pitches for me?",
        answer: "Yes. We build the outreach based on your background, positioning, and authority angles so the final message sounds like you instead of a mass email.",
      },
      {
        question: "Do you help financial professionals stay compliant?",
        answer: "We can help shape educational, non-promissory topic angles and work with your compliance process, but we do not provide legal or compliance advice.",
      },
    ],
  },
  {
    category: "Pricing & Guarantees",
    faqs: [
      {
        question: "How much does it cost?",
        answer: "The current core offer starts at $749 per month and includes a minimum placement commitment, portal access, tracking, and guest prep support.",
      },
      {
        question: "Is there a long-term commitment?",
        answer: "No. The service is month-to-month. That said, podcast authority compounds over time, so the strongest results usually come from consistency rather than one-off bursts.",
      },
      {
        question: "Do you guarantee bookings?",
        answer: "Your plan includes a clear placement commitment. If we miss the agreed target, we continue working at no additional management fee until the shortfall is made up.",
      },
      {
        question: "Do I need a big audience already?",
        answer: "No. You do need credible expertise, useful stories, and a reason a host should care. Strong positioning matters more than a large existing audience.",
      },
    ],
  },
];

