import "dotenv/config";
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// 1. Knowledge areas (identical mapping used by both assessments)5
// ---------------------------------------------------------------------------
const knowledgeAreas = [
  { key: "buying_car", name: "Buying a Car", orderIndex: 1 },
  { key: "scam_awareness", name: "Scam Awareness", orderIndex: 2 },
  { key: "insurance", name: "Insurance", orderIndex: 3 },
  { key: "roadside", name: "Roadside Assistance", orderIndex: 4 },
  { key: "registration", name: "Registration", orderIndex: 5 },
  { key: "maintenance_safety", name: "Maintenance & Safety", orderIndex: 6 },
  { key: "practical_maintenance", name: "Practical Maintenance", orderIndex: 7 },
] as const;

type KnowledgeAreaKey = (typeof knowledgeAreas)[number]["key"];

// ---------------------------------------------------------------------------
// 2. Modules — lesson copy transcribed from client PDF infographics (Aug 2026).
// heroImageUrl / lesson imageUrl: set via CMS once assets are on cms-media.
// ---------------------------------------------------------------------------

type LessonSeed = { heading: string; body: string; icon?: string; imageUrl?: string };

type ModuleSeed = {
  orderIndex: number;
  slug: string;
  title: string;
  subtitle?: string;
  knowledgeAreaKey: KnowledgeAreaKey;
  outcomes: string[]; // "what you'll learn" — Module Intro screen
  lessons: LessonSeed[]; // teaching content steps — Lesson Pages screen
  keyTakeaways: string[]; // Summary screen, 4 bullets, marks module complete
};

const modules: ModuleSeed[] = [
  {
    orderIndex: 1,
    slug: "buying-your-first-car-safely",
    title: "Buying Your First Car Safely",
    subtitle: "Make smart choices and drive confidently from day one.",
    knowledgeAreaKey: "buying_car",
    outcomes: [
      "Choose the right car",
      "Check history & condition",
      "Get an independent inspection",
      "Compare & negotiate",
      "Transfer ownership safely",
    ],
    lessons: [
      {
        heading: "Choose the right car",
        body: "Consider safety ratings, reliability, running costs and P-plate legal vehicles.",
      },
      {
        heading: "Check history & condition",
        body: "Use a vehicle history report and inspect for accidents or damage.",
      },
      {
        heading: "Get an independent inspection",
        body: "Have a qualified inspector check the car before you buy.",
      },
      {
        heading: "Compare & negotiate",
        body: "Research prices, compare options and negotiate with confidence.",
      },
      {
        heading: "Transfer ownership safely",
        body: "Complete the paperwork and transfer ownership the right way.",
      },
    ],
    keyTakeaways: [
      "Research your options",
      "Check history reports",
      "Get an independent inspection",
      "Negotiate the best deal",
      "Complete paperwork and transfer safely",
    ],
  },
  {
    orderIndex: 2,
    slug: "avoiding-scams",
    title: "Avoiding Scams",
    subtitle: "Know the tricks scammers use so you can buy with confidence and protect yourself.",
    knowledgeAreaKey: "scam_awareness",
    outcomes: [
      "Online marketplace risks",
      "Odometer fraud",
      "Written-off vehicles",
      "Fake service history",
      "Stolen vehicles",
      "Deposit scams",
      "Identity theft",
      "Safe payment methods",
    ],
    lessons: [
      {
        heading: "Online marketplace risks",
        body: "Scammers use fake ads, stolen photos and too-good-to-be-true deals. Watch for: sellers who avoid questions; listings with no history or a suspiciously low price.",
      },
      {
        heading: "Odometer fraud",
        body: "Clocked odometers can hide the true wear and lead to expensive repairs. Watch for: mileage that doesn't match the car's age; signs of wear that don't add up.",
      },
      {
        heading: "Written-off vehicles",
        body: "Written-off cars may look fine but could be unsafe and hard to insure. Watch for: repaired damage or mismatched panels; check history reports before you buy.",
      },
      {
        heading: "Fake service history",
        body: "Fake or tampered logbooks can hide poor maintenance. Watch for: incomplete or suspicious logbooks; verify with service centres if possible.",
      },
      {
        heading: "Stolen vehicles",
        body: "Buying stolen can mean you lose the car and your money. Watch for: a seller who can't prove ownership; always check the VIN and history.",
      },
      {
        heading: "Deposit scams",
        body: "Scammers take your deposit and disappear. Watch for: pressure to pay quickly; sellers unwilling to meet in person.",
      },
      {
        heading: "Identity theft",
        body: "Your personal information can be used fraudulently. Watch for: don't share ID or documents early; be cautious with online forms.",
      },
      {
        heading: "Safe payment methods",
        body: "The way you pay can protect you if something goes wrong. What to do: use secure bank transfer for full payment; avoid cash, gift cards or crypto.",
      },
    ],
    keyTakeaways: [
      "Do your research and check everything",
      "Meet in a safe public place",
      "Inspect the car and test drive",
      "Verify documents and history",
      "Trust your instincts — if it feels wrong, walk away",
    ],
  },
  {
    orderIndex: 3,
    slug: "understanding-insurance",
    title: "Understanding Insurance",
    subtitle: "Be covered. Be confident.",
    knowledgeAreaKey: "insurance",
    outcomes: [
      "Types of car insurance",
      "What affects your premium",
      "Excesses explained",
      "Making a claim",
      "Avoid uninsured losses",
    ],
    lessons: [
      {
        heading: "Types of car insurance",
        body: "Learn about Comprehensive, Third Party Property and CTP insurance.",
      },
      {
        heading: "What affects your premium",
        body: "Your age, driving history, car type, location and how you use your car can impact costs.",
      },
      {
        heading: "Excesses explained",
        body: "Understand what an excess is and how it affects a claim.",
      },
      {
        heading: "Making a claim",
        body: "Know the steps to take if you need to make a claim.",
      },
      {
        heading: "Avoid uninsured losses",
        body: "Being uninsured could leave you paying thousands.",
      },
    ],
    keyTakeaways: [
      "Compare policies — don't just choose the first option",
      "Read the PDS — always read the Product Disclosure Statement",
      "Choose the right cover for your needs and budget",
      "Review your policy each year",
      "Contact your insurer if you're unsure about anything",
    ],
  },
  {
    orderIndex: 4,
    slug: "understanding-roadside-assistance",
    title: "Understanding Roadside Assistance",
    subtitle: "Help when you need it most.",
    knowledgeAreaKey: "roadside",
    outcomes: [
      "Flat batteries",
      "Flat tyres",
      "Lockouts",
      "Breakdowns",
      "Towing",
      "Emergency help 24/7",
      "Membership options",
    ],
    lessons: [
      {
        heading: "Flat batteries",
        body: "Get a jump-start or battery replacement to get you moving.",
      },
      {
        heading: "Flat tyres",
        body: "Assistance to change your tyre so you can get back on the road.",
      },
      {
        heading: "Lockouts",
        body: "Locked out of your car? Roadside assistance can help you get back in.",
      },
      {
        heading: "Breakdowns",
        body: "Mechanical issues? Help to get your car going or tow it safely.",
      },
      {
        heading: "Towing",
        body: "If your car can't be fixed on the spot, it can be towed to a safe place.",
      },
      {
        heading: "Emergency help 24/7",
        body: "Emergency help is available anytime, day or night.",
      },
      {
        heading: "Membership options",
        body: "Choose a plan that suits your needs and budget.",
      },
    ],
    keyTakeaways: [
      "Stay safe — pull over in a safe location and turn on your hazard lights",
      "Join Safe Start Young Driver Care before you need assistance",
      "Give your location so help can find you quickly",
      "Stay with your car unless it's unsafe to do so",
      "Know your cover — understand what your plan includes and any limits",
    ],
  },
  {
    orderIndex: 5,
    slug: "registration-and-pink-slips",
    title: "Registration & Pink Slips",
    subtitle: "Stay legal. Stay on the road.",
    knowledgeAreaKey: "registration",
    outcomes: [
      "Registration renewals",
      "Pink slips (eSafety checks)",
      "Blue slips",
      "Ownership transfers",
      "Fees & charges",
      "Avoid fines & defects",
    ],
    lessons: [
      {
        heading: "Registration renewals",
        body: "Know when your registration expires and how to renew it. Know the requirements before you buy — a vehicle may look like a bargain, but registration, inspections and transfer costs can quickly add up.",
      },
      {
        heading: "Pink slips (eSafety checks)",
        body: "Most vehicles over 5 years old require an annual safety inspection.",
      },
      {
        heading: "Blue slips",
        body: "Required for unregistered vehicles and some interstate transfers.",
      },
      {
        heading: "Ownership transfers",
        body: "Transfer registration correctly when buying or selling a vehicle.",
      },
      {
        heading: "Fees & charges",
        body: "Understand registration, transfer and inspection costs.",
      },
      {
        heading: "Avoid fines & defects",
        body: "Keep your vehicle roadworthy and compliant.",
      },
    ],
    keyTakeaways: [
      "Check registration status — make sure the vehicle is registered and not written off",
      "Confirm pink slip requirements before you buy",
      "Budget for transfer fees, pink slip costs and registration",
      "Complete ownership transfer online or at a Service NSW centre",
      "Maintain registration and renew on time to avoid fines",
    ],
  },
  {
    orderIndex: 6,
    slug: "car-maintenance-and-safety",
    title: "Car Maintenance & Safety",
    subtitle: "Look after your car. Protect yourself.",
    knowledgeAreaKey: "maintenance_safety",
    outcomes: [
      "Regular servicing",
      "Tyres & tyre pressure",
      "Fluids & engine checks",
      "Dashboard warning lights",
      "Battery & emergency equipment",
    ],
    lessons: [
      {
        heading: "Regular servicing",
        body: "Follow your manufacturer's service schedule to keep your vehicle reliable, safe and maintain its resale value.",
      },
      {
        heading: "Tyres & tyre pressure",
        body: "Learn how to check tyre pressure, inspect tread depth and recognise uneven tyre wear before it becomes a safety risk.",
      },
      {
        heading: "Fluids & engine checks",
        body: "Understand how to check engine oil, coolant, brake fluid and windscreen washer levels to avoid expensive repairs.",
      },
      {
        heading: "Dashboard warning lights",
        body: "Know what common warning lights mean and when you should stop driving and seek professional advice.",
      },
      {
        heading: "Battery & emergency equipment",
        body: "Learn how to identify a weak battery, carry essential emergency equipment and prepare for unexpected breakdowns. Why it matters: safer driving, fewer breakdowns, lower repair costs, better fuel efficiency and higher resale value.",
      },
    ],
    keyTakeaways: [
      "Walk around your car — check tyres, lights, mirrors and look for leaks or damage",
      "Check fluids monthly — engine oil, coolant and washer fluid, especially before long trips",
      "Don't skip services — regular servicing helps prevent breakdowns",
      "Listen to your car — unusual noises, vibrations or warning lights should never be ignored",
      "Be prepared — carry a spare tyre or repair kit, jumper leads, a torch and know who to call",
    ],
  },
  {
    orderIndex: 7,
    slug: "practical-tips-on-maintaining-your-car-safely",
    title: "Practical Tips on Maintaining Your Car Safely",
    subtitle: "Hands-on skills every young driver should know.",
    knowledgeAreaKey: "practical_maintenance",
    outcomes: [
      "Changing a flat tyre",
      "Checking & inflating tyres",
      "Checking fluids",
      "Battery checks",
      "Lights & indicators",
      "Emergency kit",
      "Safety first — never DIY",
    ],
    lessons: [
      {
        heading: "Changing a flat tyre",
        body: "Stop safely, use the jack and loosen the nuts. Fit the spare wheel and tighten the nuts. Follow temporary speed limits until the tyre is properly repaired or replaced.",
      },
      {
        heading: "Checking & inflating tyres",
        body: "Find the correct pressure and use an air pump. Check when tyres are cold. Inspect tread depth and wear regularly.",
      },
      {
        heading: "Checking fluids",
        body: "Check engine oil, coolant and washer fluid yourself. Brake fluid should only be checked visually — if it looks low, see a mechanic.",
      },
      {
        heading: "Battery checks",
        body: "Check for corrosion, look for signs of a weak battery and keep terminals clean.",
      },
      {
        heading: "Lights & indicators",
        body: "Check headlights, brake lights, indicators and reverse lights. Make sure your hazard lights work.",
      },
      {
        heading: "Emergency kit",
        body: "Carry a spare tyre, jack, wheel brace and torch; jumper leads, gloves and a hi-vis vest; plus a first aid kit and phone charger.",
      },
      {
        heading: "Safety first — never DIY",
        body: "Leave brake repairs, airbag systems, steering or suspension repairs, and high-voltage EV or fuel system repairs to a qualified mechanic. If unsure, always get it checked by a professional. A well-maintained car is a safer car.",
      },
    ],
    keyTakeaways: [
      "Check your tyres monthly — keep the right pressure and good tread",
      "Never ignore warning lights — they are there to keep you safe",
      "Keep washer fluid topped up — clear vision is critical for safety",
      "Replace worn wiper blades for good visibility in all weather",
      "Know when to call a mechanic — if unsure, get it checked by a professional",
    ],
  },
];

// ---------------------------------------------------------------------------
// 3. Question banks — transcribed exactly from the client's documents:
//    "Safe Start — Starting Grid" and "Finish Line Knowledge Check".
//    Each question carries its knowledge area (per the mapping table) and
//    the module it belongs to, for the NRMA Learning KPIs (pre/post score,
//    % improvement, questions most commonly answered incorrectly, etc).
// ---------------------------------------------------------------------------

type OptionSeed = { letter: "A" | "B" | "C" | "D"; text: string; isCorrect: boolean };
type QuestionSeed = {
  orderIndex: number;
  knowledgeAreaKey: KnowledgeAreaKey;
  moduleSlug: string;
  text: string;
  options: OptionSeed[];
};

const startingGrid: QuestionSeed[] = [
  {
    orderIndex: 1,
    knowledgeAreaKey: "buying_car",
    moduleSlug: "buying-your-first-car-safely",
    text: "Before buying a used car, which is the best combination of checks?",
    options: [
      { letter: "A", text: "Colour, kilometres and registration expiry", isCorrect: false },
      { letter: "B", text: "Price, fuel level and number of previous owners", isCorrect: false },
      { letter: "C", text: "Vehicle history, condition and an independent inspection", isCorrect: true },
      { letter: "D", text: "Service date and tyre brand", isCorrect: false },
    ],
  },
  {
    orderIndex: 2,
    knowledgeAreaKey: "buying_car",
    moduleSlug: "buying-your-first-car-safely",
    text: "Why should you research similar vehicles before making an offer?",
    options: [
      { letter: "A", text: "To determine the registration fee", isCorrect: false },
      { letter: "B", text: "To understand market pricing and negotiate confidently", isCorrect: true },
      { letter: "C", text: "To determine the insurance excess", isCorrect: false },
      { letter: "D", text: "To avoid needing an inspection", isCorrect: false },
    ],
  },
  {
    orderIndex: 3,
    knowledgeAreaKey: "scam_awareness",
    moduleSlug: "avoiding-scams",
    text: "A seller wants a deposit immediately but won't meet you or let you inspect the car. What should you do?",
    options: [
      { letter: "A", text: "Pay a small deposit to hold the vehicle", isCorrect: false },
      { letter: "B", text: "Ask them to send more photos", isCorrect: false },
      { letter: "C", text: "Don't pay until you've verified the seller and vehicle", isCorrect: true },
      { letter: "D", text: "Pay by cash instead", isCorrect: false },
    ],
  },
  {
    orderIndex: 4,
    knowledgeAreaKey: "scam_awareness",
    moduleSlug: "avoiding-scams",
    text: "Which could indicate possible odometer fraud?",
    options: [
      { letter: "A", text: "The vehicle has recently been serviced", isCorrect: false },
      {
        letter: "B",
        text: "The displayed kilometres don't appear consistent with the vehicle's age and wear",
        isCorrect: true,
      },
      { letter: "C", text: "The vehicle has new tyres", isCorrect: false },
      { letter: "D", text: "The registration was recently renewed", isCorrect: false },
    ],
  },
  {
    orderIndex: 5,
    knowledgeAreaKey: "insurance",
    moduleSlug: "understanding-insurance",
    text: "Which type of insurance generally provides the broadest protection for damage to your own car as well as damage you cause to other vehicles/property?",
    options: [
      { letter: "A", text: "CTP", isCorrect: false },
      { letter: "B", text: "Third Party Property", isCorrect: false },
      { letter: "C", text: "Comprehensive", isCorrect: true },
      { letter: "D", text: "Roadside Assistance", isCorrect: false },
    ],
  },
  {
    orderIndex: 6,
    knowledgeAreaKey: "insurance",
    moduleSlug: "understanding-insurance",
    text: "What is an insurance excess?",
    options: [
      { letter: "A", text: "Your annual registration payment", isCorrect: false },
      { letter: "B", text: "The maximum amount an insurer can pay", isCorrect: false },
      { letter: "C", text: "An amount you may need to contribute when making a claim", isCorrect: true },
      { letter: "D", text: "The amount your vehicle depreciates each year", isCorrect: false },
    ],
  },
  {
    orderIndex: 7,
    knowledgeAreaKey: "roadside",
    moduleSlug: "understanding-roadside-assistance",
    text: "Which situation would typically be something roadside assistance can help with?",
    options: [
      { letter: "A", text: "Buying a used vehicle", isCorrect: false },
      { letter: "B", text: "Renewing registration", isCorrect: false },
      { letter: "C", text: "A flat battery", isCorrect: true },
      { letter: "D", text: "Comparing insurance policies", isCorrect: false },
    ],
  },
  {
    orderIndex: 8,
    knowledgeAreaKey: "roadside",
    moduleSlug: "understanding-roadside-assistance",
    text: "If your vehicle can't be repaired where it breaks down, what service may roadside assistance provide?",
    options: [
      { letter: "A", text: "Registration transfer", isCorrect: false },
      { letter: "B", text: "Towing", isCorrect: true },
      { letter: "C", text: "Comprehensive insurance", isCorrect: false },
      { letter: "D", text: "Vehicle finance", isCorrect: false },
    ],
  },
  {
    orderIndex: 9,
    knowledgeAreaKey: "registration",
    moduleSlug: "registration-and-pink-slips",
    text: "What is the main purpose of a NSW pink slip/eSafety Check?",
    options: [
      { letter: "A", text: "To establish the vehicle's market value", isCorrect: false },
      { letter: "B", text: "To provide insurance", isCorrect: false },
      {
        letter: "C",
        text: "To confirm the vehicle meets required safety standards for registration",
        isCorrect: true,
      },
      { letter: "D", text: "To determine whether finance is owing", isCorrect: false },
    ],
  },
  {
    orderIndex: 10,
    knowledgeAreaKey: "registration",
    moduleSlug: "registration-and-pink-slips",
    text: "What is a blue slip generally associated with?",
    options: [
      { letter: "A", text: "Comprehensive insurance", isCorrect: false },
      { letter: "B", text: "Roadside assistance", isCorrect: false },
      { letter: "C", text: "Unregistered vehicles and some interstate transfers", isCorrect: true },
      { letter: "D", text: "Regular vehicle servicing", isCorrect: false },
    ],
  },
  {
    orderIndex: 11,
    knowledgeAreaKey: "maintenance_safety",
    moduleSlug: "car-maintenance-and-safety",
    text: "Why is following the manufacturer's recommended servicing schedule important?",
    options: [
      { letter: "A", text: "It guarantees the car will never break down", isCorrect: false },
      { letter: "B", text: "It helps maintain reliability, safety and vehicle value", isCorrect: true },
      { letter: "C", text: "It removes the need to check tyres", isCorrect: false },
      { letter: "D", text: "It automatically extends registration", isCorrect: false },
    ],
  },
  {
    orderIndex: 12,
    knowledgeAreaKey: "maintenance_safety",
    moduleSlug: "car-maintenance-and-safety",
    text: "Which combination should you regularly check?",
    options: [
      { letter: "A", text: "Paint, stereo and seat covers", isCorrect: false },
      { letter: "B", text: "Number plates, keys and floor mats", isCorrect: false },
      { letter: "C", text: "Tyres, fluids, lights and battery condition", isCorrect: true },
      { letter: "D", text: "Registration papers and insurance only", isCorrect: false },
    ],
  },
  {
    orderIndex: 13,
    knowledgeAreaKey: "practical_maintenance",
    moduleSlug: "practical-tips-on-maintaining-your-car-safely",
    text: "When should you ideally check tyre pressure?",
    options: [
      { letter: "A", text: "Immediately after a long drive", isCorrect: false },
      { letter: "B", text: "Only when a warning light appears", isCorrect: false },
      { letter: "C", text: "When the tyres are cold", isCorrect: true },
      { letter: "D", text: "Only during a scheduled service", isCorrect: false },
    ],
  },
  {
    orderIndex: 14,
    knowledgeAreaKey: "practical_maintenance",
    moduleSlug: "practical-tips-on-maintaining-your-car-safely",
    text: "Which repair should a young driver NOT attempt themselves unless appropriately qualified?",
    options: [
      { letter: "A", text: "Topping up washer fluid", isCorrect: false },
      { letter: "B", text: "Checking tyre pressure", isCorrect: false },
      { letter: "C", text: "Checking engine oil", isCorrect: false },
      { letter: "D", text: "Repairing an airbag system", isCorrect: true },
    ],
  },
];

const finishLine: QuestionSeed[] = [
  {
    orderIndex: 1,
    knowledgeAreaKey: "buying_car",
    moduleSlug: "buying-your-first-car-safely",
    text: "You've found a used car you like. What should you do before committing to buy it?",
    options: [
      { letter: "A", text: "Check whether it has a full tank of fuel", isCorrect: false },
      {
        letter: "B",
        text: "Check its history and condition and arrange an independent inspection",
        isCorrect: true,
      },
      { letter: "C", text: "Make an offer immediately before someone else buys it", isCorrect: false },
      { letter: "D", text: "Check whether the seller will include accessories", isCorrect: false },
    ],
  },
  {
    orderIndex: 2,
    knowledgeAreaKey: "buying_car",
    moduleSlug: "buying-your-first-car-safely",
    text: "You're unsure whether the asking price for a used car is reasonable. What is the best next step?",
    options: [
      { letter: "A", text: "Compare it with similar vehicles currently for sale", isCorrect: true },
      { letter: "B", text: "Ask the seller what they originally paid", isCorrect: false },
      { letter: "C", text: "Check the cost of registration", isCorrect: false },
      { letter: "D", text: "Choose the car with the lowest kilometres", isCorrect: false },
    ],
  },
  {
    orderIndex: 3,
    knowledgeAreaKey: "scam_awareness",
    moduleSlug: "avoiding-scams",
    text: "An online seller says several other buyers are interested and asks you to transfer a deposit before seeing the car. What is the safest response?",
    options: [
      { letter: "A", text: "Transfer a small amount so you don't miss out", isCorrect: false },
      { letter: "B", text: "Ask for their bank details first", isCorrect: false },
      {
        letter: "C",
        text: "Verify the seller and vehicle and inspect the car before paying",
        isCorrect: true,
      },
      { letter: "D", text: "Offer to pay the full amount in cash", isCorrect: false },
    ],
  },
  {
    orderIndex: 4,
    knowledgeAreaKey: "scam_awareness",
    moduleSlug: "avoiding-scams",
    text: "A car shows unusually low kilometres but the interior and controls appear heavily worn. What should this make you consider?",
    options: [
      { letter: "A", text: "The car has probably been well maintained", isCorrect: false },
      { letter: "B", text: "The odometer reading may need further verification", isCorrect: true },
      { letter: "C", text: "The registration may have expired", isCorrect: false },
      { letter: "D", text: "The tyres must have been replaced", isCorrect: false },
    ],
  },
  {
    orderIndex: 5,
    knowledgeAreaKey: "insurance",
    moduleSlug: "understanding-insurance",
    text: "You want insurance that generally covers accidental damage to your own car as well as damage you cause to other vehicles or property. Which cover would you consider?",
    options: [
      { letter: "A", text: "CTP", isCorrect: false },
      { letter: "B", text: "Roadside assistance", isCorrect: false },
      { letter: "C", text: "Comprehensive insurance", isCorrect: true },
      { letter: "D", text: "Third Party Property only", isCorrect: false },
    ],
  },
  {
    orderIndex: 6,
    knowledgeAreaKey: "insurance",
    moduleSlug: "understanding-insurance",
    text: "You make an insurance claim and your policy requires you to pay the first $800. What is this payment called?",
    options: [
      { letter: "A", text: "Premium", isCorrect: false },
      { letter: "B", text: "Excess", isCorrect: true },
      { letter: "C", text: "Registration fee", isCorrect: false },
      { letter: "D", text: "Market value", isCorrect: false },
    ],
  },
  {
    orderIndex: 7,
    knowledgeAreaKey: "roadside",
    moduleSlug: "understanding-roadside-assistance",
    text: "You turn the key and your car won't start because the battery is flat. Who could you call for assistance?",
    options: [
      { letter: "A", text: "Your registration provider", isCorrect: false },
      { letter: "B", text: "Roadside assistance", isCorrect: true },
      { letter: "C", text: "A vehicle finance company", isCorrect: false },
      { letter: "D", text: "Your CTP insurer", isCorrect: false },
    ],
  },
  {
    orderIndex: 8,
    knowledgeAreaKey: "roadside",
    moduleSlug: "understanding-roadside-assistance",
    text: "Your car breaks down and cannot be safely repaired at the roadside. What may happen next?",
    options: [
      { letter: "A", text: "Your registration is cancelled", isCorrect: false },
      { letter: "B", text: "Your insurance excess is refunded", isCorrect: false },
      { letter: "C", text: "The vehicle may be towed to a safe place or repairer", isCorrect: true },
      { letter: "D", text: "You automatically receive a replacement car", isCorrect: false },
    ],
  },
  {
    orderIndex: 9,
    knowledgeAreaKey: "registration",
    moduleSlug: "registration-and-pink-slips",
    text: "Your NSW vehicle requires a pink slip before registration can be renewed. What is the inspection checking?",
    options: [
      { letter: "A", text: "Whether the car is worth its asking price", isCorrect: false },
      { letter: "B", text: "Whether the vehicle meets required safety standards", isCorrect: true },
      { letter: "C", text: "Whether the owner has comprehensive insurance", isCorrect: false },
      { letter: "D", text: "Whether finance is owing on the vehicle", isCorrect: false },
    ],
  },
  {
    orderIndex: 10,
    knowledgeAreaKey: "registration",
    moduleSlug: "registration-and-pink-slips",
    text: "You purchase an unregistered vehicle in NSW. Which inspection may be required?",
    options: [
      { letter: "A", text: "Pink slip only", isCorrect: false },
      { letter: "B", text: "Insurance inspection", isCorrect: false },
      { letter: "C", text: "Blue slip", isCorrect: true },
      { letter: "D", text: "Roadside inspection", isCorrect: false },
    ],
  },
  {
    orderIndex: 11,
    knowledgeAreaKey: "maintenance_safety",
    moduleSlug: "car-maintenance-and-safety",
    text: "What is one of the main benefits of servicing your vehicle according to the manufacturer's schedule?",
    options: [
      { letter: "A", text: "It means you'll never need roadside assistance", isCorrect: false },
      {
        letter: "B",
        text: "It helps keep the vehicle reliable and safe and can protect its resale value",
        isCorrect: true,
      },
      { letter: "C", text: "It eliminates the need to check fluids", isCorrect: false },
      { letter: "D", text: "It guarantees lower insurance premiums", isCorrect: false },
    ],
  },
  {
    orderIndex: 12,
    knowledgeAreaKey: "maintenance_safety",
    moduleSlug: "car-maintenance-and-safety",
    text: "Which group of items should form part of your regular vehicle checks?",
    options: [
      { letter: "A", text: "Tyres, fluids, lights and battery", isCorrect: true },
      { letter: "B", text: "Stereo, paintwork, floor mats and seats", isCorrect: false },
      { letter: "C", text: "Number plates, radio and air conditioning only", isCorrect: false },
      { letter: "D", text: "Insurance documents and registration only", isCorrect: false },
    ],
  },
  {
    orderIndex: 13,
    knowledgeAreaKey: "practical_maintenance",
    moduleSlug: "practical-tips-on-maintaining-your-car-safely",
    text: "You are about to check your tyre pressures. When is the best time to do it?",
    options: [
      { letter: "A", text: "When the tyres are cold", isCorrect: true },
      { letter: "B", text: "Immediately after highway driving", isCorrect: false },
      { letter: "C", text: "Only when the tyres look flat", isCorrect: false },
      { letter: "D", text: "Only at your annual service", isCorrect: false },
    ],
  },
  {
    orderIndex: 14,
    knowledgeAreaKey: "practical_maintenance",
    moduleSlug: "practical-tips-on-maintaining-your-car-safely",
    text: "Which job should be left to an appropriately qualified mechanic?",
    options: [
      { letter: "A", text: "Checking washer fluid", isCorrect: false },
      { letter: "B", text: "Checking tyre pressure", isCorrect: false },
      { letter: "C", text: "Inspecting your engine oil level", isCorrect: false },
      { letter: "D", text: "Repairing an airbag system", isCorrect: true },
    ],
  },
];

// ---------------------------------------------------------------------------
// 4. Seed logic — idempotent, safe to re-run.
//    Parents (Module, KnowledgeArea, Assessment) upsert on their unique
//    fields (slug / key / type). Children (ModuleOutcome, Lesson,
//    LessonTakeaway, Question, QuestionOption) have no unique constraint of
//    their own, so we find-by-natural-key and update-or-create rather than
//    delete+recreate — this avoids breaking FK-restricted rows
//    (AssessmentAnswer, LessonView) once real learner data exists.
// ---------------------------------------------------------------------------

async function seedKnowledgeAreas() {
  const idByKey = new Map<KnowledgeAreaKey, string>();
  for (const ka of knowledgeAreas) {
    const record = await prisma.knowledgeArea.upsert({
      where: { key: ka.key },
      update: { name: ka.name, orderIndex: ka.orderIndex },
      create: { key: ka.key, name: ka.name, orderIndex: ka.orderIndex },
    });
    idByKey.set(ka.key, record.id);
  }
  return idByKey;
}

async function seedModules() {
  const idBySlug = new Map<string, string>();

  for (const mod of modules) {
    const record = await prisma.module.upsert({
      where: { slug: mod.slug },
      update: {
        orderIndex: mod.orderIndex,
        title: mod.title,
        subtitle: mod.subtitle,
      },
      create: {
        slug: mod.slug,
        orderIndex: mod.orderIndex,
        title: mod.title,
        subtitle: mod.subtitle,
      },
    });
    idBySlug.set(mod.slug, record.id);

    // --- Outcomes ("what you'll learn") ---
    for (const [i, text] of mod.outcomes.entries()) {
      const orderIndex = i + 1;
      const existing = await prisma.moduleOutcome.findFirst({
        where: { moduleId: record.id, orderIndex },
      });
      if (existing) {
        await prisma.moduleOutcome.update({ where: { id: existing.id }, data: { text } });
      } else {
        await prisma.moduleOutcome.create({ data: { moduleId: record.id, orderIndex, text } });
      }
    }

    // --- Lesson content steps ---
    for (const [i, lesson] of mod.lessons.entries()) {
      const orderIndex = i + 1;
      const existing = await prisma.lesson.findFirst({
        where: { moduleId: record.id, orderIndex, type: "lesson" },
      });
      const data = {
        moduleId: record.id,
        orderIndex,
        type: "lesson",
        heading: lesson.heading,
        body: lesson.body,
        icon: lesson.icon,
        imageUrl: lesson.imageUrl,
      };
      if (existing) {
        await prisma.lesson.update({ where: { id: existing.id }, data });
      } else {
        await prisma.lesson.create({ data });
      }
    }

    // --- Summary step ("Key Takeaways") — always the final step ---
    const summaryOrderIndex = mod.lessons.length + 1;
    let summaryLesson = await prisma.lesson.findFirst({
      where: { moduleId: record.id, type: "summary" },
    });
    if (summaryLesson) {
      summaryLesson = await prisma.lesson.update({
        where: { id: summaryLesson.id },
        data: { orderIndex: summaryOrderIndex, heading: "Key Takeaways" },
      });
    } else {
      summaryLesson = await prisma.lesson.create({
        data: {
          moduleId: record.id,
          orderIndex: summaryOrderIndex,
          type: "summary",
          heading: "Key Takeaways",
        },
      });
    }

    for (const [i, text] of mod.keyTakeaways.entries()) {
      const orderIndex = i + 1;
      const existing = await prisma.lessonTakeaway.findFirst({
        where: { lessonId: summaryLesson.id, orderIndex },
      });
      if (existing) {
        await prisma.lessonTakeaway.update({ where: { id: existing.id }, data: { text } });
      } else {
        await prisma.lessonTakeaway.create({ data: { lessonId: summaryLesson.id, orderIndex, text } });
      }
    }

    await prisma.moduleOutcome.deleteMany({
      where: { moduleId: record.id, orderIndex: { gt: mod.outcomes.length } },
    });

    await prisma.lesson.deleteMany({
      where: {
        moduleId: record.id,
        type: "lesson",
        orderIndex: { gt: mod.lessons.length },
      },
    });

    await prisma.lessonTakeaway.deleteMany({
      where: {
        lessonId: summaryLesson.id,
        orderIndex: { gt: mod.keyTakeaways.length },
      },
    });
  }

  return idBySlug;
}

/** Three quiz questions per module — sourced from assessment items for that module. */
async function seedModuleQuizzes(moduleIds: Map<string, string>) {
  const [startingGrid, finishLine] = await Promise.all([
    prisma.assessment.findFirst({ where: { type: "starting_grid" }, select: { id: true } }),
    prisma.assessment.findFirst({ where: { type: "finish_line" }, select: { id: true } }),
  ]);
  if (!startingGrid || !finishLine) {
    throw new Error("Assessments must be seeded before module quizzes");
  }

  for (const [, moduleId] of moduleIds) {
    const sgQuestions = await prisma.question.findMany({
      where: { assessmentId: startingGrid.id, moduleId },
      orderBy: { orderIndex: "asc" },
      include: { options: { orderBy: { letter: "asc" } } },
    });
    const flQuestion = await prisma.question.findFirst({
      where: { assessmentId: finishLine.id, moduleId },
      orderBy: { orderIndex: "asc" },
      include: { options: { orderBy: { letter: "asc" } } },
    });

    const sources = [...sgQuestions, ...(flQuestion ? [flQuestion] : [])].slice(0, 3);
    if (sources.length < 3) {
      console.warn(`  Module ${moduleId}: only ${sources.length} source questions — expected 3`);
    }

    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      const orderIndex = i + 1;

      let question = await prisma.moduleQuizQuestion.findFirst({
        where: { moduleId, orderIndex },
      });
      if (question) {
        question = await prisma.moduleQuizQuestion.update({
          where: { id: question.id },
          data: { text: source.text },
        });
      } else {
        question = await prisma.moduleQuizQuestion.create({
          data: { moduleId, orderIndex, text: source.text },
        });
      }

      for (const opt of source.options) {
        const existingOption = await prisma.moduleQuizOption.findFirst({
          where: { questionId: question.id, letter: opt.letter },
        });
        if (existingOption) {
          await prisma.moduleQuizOption.update({
            where: { id: existingOption.id },
            data: { text: opt.text, isCorrect: opt.isCorrect },
          });
        } else {
          await prisma.moduleQuizOption.create({
            data: {
              questionId: question.id,
              letter: opt.letter,
              text: opt.text,
              isCorrect: opt.isCorrect,
            },
          });
        }
      }
    }
  }
}

async function seedAssessment(
  type: "starting_grid" | "finish_line",
  title: string,
  subtitle: string | null,
  description: string | null,
  questions: QuestionSeed[],
  knowledgeAreaIds: Map<KnowledgeAreaKey, string>,
  moduleIds: Map<string, string>
) {
  if (questions.length !== 14) {
    throw new Error(`${type} must have exactly 14 questions, found ${questions.length}`);
  }

  const assessment = await prisma.assessment.upsert({
    where: { type },
    update: { title, subtitle: subtitle ?? undefined, description: description ?? undefined },
    create: { type, title, subtitle: subtitle ?? undefined, description: description ?? undefined },
  });

  for (const q of questions) {
    if (q.options.length !== 4) {
      throw new Error(`${type} Q${q.orderIndex} must have exactly 4 options, found ${q.options.length}`);
    }
    const correctCount = q.options.filter((o) => o.isCorrect).length;
    if (correctCount !== 1) {
      throw new Error(
        `${type} Q${q.orderIndex} must have exactly 1 correct option, found ${correctCount}`
      );
    }

    const knowledgeAreaId = knowledgeAreaIds.get(q.knowledgeAreaKey);
    const moduleId = moduleIds.get(q.moduleSlug);
    if (!knowledgeAreaId) {
      throw new Error(`Unknown knowledge area key "${q.knowledgeAreaKey}" for ${type} Q${q.orderIndex}`);
    }
    if (!moduleId) {
      throw new Error(`Unknown module slug "${q.moduleSlug}" for ${type} Q${q.orderIndex}`);
    }

    let question = await prisma.question.findFirst({
      where: { assessmentId: assessment.id, orderIndex: q.orderIndex },
    });
    if (question) {
      question = await prisma.question.update({
        where: { id: question.id },
        data: { text: q.text, knowledgeAreaId, moduleId },
      });
    } else {
      question = await prisma.question.create({
        data: {
          assessmentId: assessment.id,
          orderIndex: q.orderIndex,
          text: q.text,
          knowledgeAreaId,
          moduleId,
        },
      });
    }

    for (const opt of q.options) {
      const existingOption = await prisma.questionOption.findFirst({
        where: { questionId: question.id, letter: opt.letter },
      });
      if (existingOption) {
        await prisma.questionOption.update({
          where: { id: existingOption.id },
          data: { text: opt.text, isCorrect: opt.isCorrect },
        });
      } else {
        await prisma.questionOption.create({
          data: {
            questionId: question.id,
            letter: opt.letter,
            text: opt.text,
            isCorrect: opt.isCorrect,
          },
        });
      }
    }
  }
}

async function main() {
  console.log("Seeding knowledge areas...");
  const knowledgeAreaIds = await seedKnowledgeAreas();
  console.log(`  ${knowledgeAreaIds.size} knowledge areas seeded.`);

  console.log("Seeding modules, outcomes, lessons and key takeaways...");
  const moduleIds = await seedModules();
  console.log(`  ${moduleIds.size} modules seeded.`);

  console.log("Seeding Starting Grid (14 questions)...");
  await seedAssessment(
    "starting_grid",
    "Safe Start — Starting Grid",
    "How much do you know about owning and looking after a car?",
    "14 questions • About 5 minutes • Your starting score will be compared with your Finish Line score.",
    startingGrid,
    knowledgeAreaIds,
    moduleIds
  );
  console.log("  Starting Grid seeded.");

  console.log("Seeding Finish Line (14 questions)...");
  await seedAssessment(
    "finish_line",
    "Finish Line Knowledge Check",
    null,
    "14 questions • About 5 minutes • Let's see what you've learned.",
    finishLine,
    knowledgeAreaIds,
    moduleIds
  );
  console.log("  Finish Line seeded.");

  console.log("Seeding module quizzes (3 per module)...");
  await seedModuleQuizzes(moduleIds);
  console.log("  Module quizzes seeded.");

  console.log("Seed complete ✅");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
