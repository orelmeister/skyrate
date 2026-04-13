"use client";

interface PIATemplateGalleryProps {
  onSelectTemplate: (question: string, category: string) => void;
}

const PIA_TEMPLATES = [
  {
    category: "competitive_bidding",
    name: "Competitive Bidding",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    question: "Please provide documentation showing that you posted your Form 470 and waited the required 28 days before signing a contract.",
    color: "from-blue-500 to-indigo-600",
    bgColor: "bg-blue-50",
    iconColor: "text-blue-600",
  },
  {
    category: "cost_effectiveness",
    name: "Cost-Effectiveness",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    question: "Please explain how you determined that the selected service provider was the most cost-effective.",
    color: "from-emerald-500 to-teal-600",
    bgColor: "bg-emerald-50",
    iconColor: "text-emerald-600",
  },
  {
    category: "entity_eligibility",
    name: "Entity Eligibility",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    question: "Please confirm that your entity meets the eligibility requirements for E-Rate funding.",
    color: "from-purple-500 to-violet-600",
    bgColor: "bg-purple-50",
    iconColor: "text-purple-600",
  },
  {
    category: "service_eligibility",
    name: "Service Eligibility",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
    ),
    question: "Please explain how the requested services are eligible under the E-Rate program.",
    color: "from-amber-500 to-orange-600",
    bgColor: "bg-amber-50",
    iconColor: "text-amber-600",
  },
  {
    category: "discount_rate",
    name: "Discount Rate",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
    ),
    question: "Please verify the school lunch data used to calculate your discount rate.",
    color: "from-rose-500 to-pink-600",
    bgColor: "bg-rose-50",
    iconColor: "text-rose-600",
  },
  {
    category: "contracts",
    name: "Contracts",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    question: "Please provide a copy of your signed contract and explain how the amounts match your Form 471.",
    color: "from-cyan-500 to-sky-600",
    bgColor: "bg-cyan-50",
    iconColor: "text-cyan-600",
  },
  {
    category: "cipa",
    name: "CIPA Compliance",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    question: "Please confirm that your entity has adopted an Internet Safety Policy and held the required public hearing.",
    color: "from-lime-500 to-green-600",
    bgColor: "bg-lime-50",
    iconColor: "text-lime-600",
  },
  {
    category: "thirty_percent_rule",
    name: "30% Rule",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    question: "Please provide a breakdown showing the eligible and ineligible components of this FRN.",
    color: "from-fuchsia-500 to-purple-600",
    bgColor: "bg-fuchsia-50",
    iconColor: "text-fuchsia-600",
  },
] as const;

export function PIATemplateGallery({ onSelectTemplate }: PIATemplateGalleryProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {PIA_TEMPLATES.map((template) => (
        <button
          key={template.category}
          onClick={() => onSelectTemplate(template.question, template.category)}
          className="text-left p-4 bg-white border border-slate-200 rounded-xl hover:shadow-lg hover:border-teal-300 transition-all group"
        >
          <div className={`w-10 h-10 rounded-lg ${template.bgColor} flex items-center justify-center mb-3 ${template.iconColor} group-hover:scale-110 transition-transform`}>
            {template.icon}
          </div>
          <h4 className="font-semibold text-slate-900 text-sm mb-1">
            {template.name}
          </h4>
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">
            {template.question}
          </p>
        </button>
      ))}
    </div>
  );
}
