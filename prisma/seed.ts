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
// 2. Modules
//
// Modules 4 and 7 are transcribed from the supplied client infographics
// (Module_4_Roadside_Assistance.pdf and
// Module_7_Practical_Tips_on_Maintaining_Your_Car_Safely.pdf).
//
// Modules 1, 2, 3, 5, 6 have no supplied lesson-copy source document — the
// brief only names the topics and the quizzes test them. Outcomes / lesson
// content / key takeaways below are drafted to match the quiz content as
// PLACEHOLDER copy. Flag these for the client to review/replace before
// launch; do not treat as final content.
//
// heroImageUrl is left null for every module — no hosted asset URLs were
// supplied. Set these via the admin panel once assets are on the CDN
// (client specifically asked for Module 4's image to be updated).
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
    subtitle: "Buy smart before you sign anything.",
    knowledgeAreaKey: "buying_car",
    // PLACEHOLDER — no source doc supplied for Module 1
    outcomes: [
      "Understand which checks matter most before buying a used car",
      "Know how to read a vehicle history report",
      "Get an independent inspection instead of relying on the seller",
      "Research comparable vehicles so you can negotiate with confidence",
    ],
    lessons: [
      {
        heading: "Why the basics aren't enough",
        body: "Colour, fuel level and number of previous owners tell you very little about whether a car is safe or fairly priced. Focus on vehicle history, condition and an independent inspection instead.",
      },
      {
        heading: "Vehicle history checks",
        body: "Run a vehicle history check to confirm there's no money owing, it hasn't been written off, and the odometer reading is consistent with its age and wear.",
      },
      {
        heading: "Get it inspected",
        body: "Have an independent mechanic inspect the car before you commit — not one recommended by the seller.",
      },
      {
        heading: "Know the market",
        body: "Compare similar vehicles for sale to understand fair market pricing so you can negotiate confidently and avoid overpaying.",
      },
    ],
    keyTakeaways: [
      "Check vehicle history, condition and get an independent inspection",
      "Never skip the inspection, even if the seller says it's not needed",
      "Compare similar vehicles before you make an offer",
      "Fair pricing comes from research, not guesswork",
    ],
  },
  {
    orderIndex: 2,
    slug: "avoiding-scams",
    title: "Avoiding Scams",
    subtitle: "Spot the warning signs before you pay.",
    knowledgeAreaKey: "scam_awareness",
    // PLACEHOLDER — no source doc supplied for Module 2
    outcomes: [
      "Recognise common used-car scam tactics",
      "Know why you should never pay a deposit sight-unseen",
      "Spot possible signs of odometer fraud",
      "Verify a seller and vehicle before transferring any money",
    ],
    lessons: [
      {
        heading: "The deposit-before-inspection trap",
        body: "If a seller wants a deposit immediately but won't meet you or let you inspect the car, don't pay. Verify the seller and the vehicle first.",
      },
      {
        heading: "Odometer fraud",
        body: "Be cautious if the displayed kilometres don't appear consistent with the vehicle's age and wear — this can indicate the odometer has been tampered with.",
      },
      {
        heading: "Staying safe when meeting a seller",
        body: "Meet in a safe, public location, inspect the car in person, and never send money before you've verified who you're dealing with.",
      },
    ],
    keyTakeaways: [
      "Never pay a deposit before inspecting the car in person",
      "Mismatched kilometres and wear can signal odometer fraud",
      "Verify the seller and vehicle before any money changes hands",
      "Meet in a safe, public location",
    ],
  },
  {
    orderIndex: 3,
    slug: "understanding-insurance",
    title: "Understanding Insurance",
    subtitle: "Know your cover before you need it.",
    knowledgeAreaKey: "insurance",
    // PLACEHOLDER — no source doc supplied for Module 3
    outcomes: [
      "Understand the difference between CTP, Third Party and Comprehensive cover",
      "Know what Comprehensive insurance protects",
      "Understand what an excess is and when you pay it",
      "Choose a policy that suits a first car and a young driver's budget",
    ],
    lessons: [
      {
        heading: "Types of car insurance",
        body: "CTP covers injury to other people. Third Party Property covers damage you cause to other vehicles/property. Comprehensive generally provides the broadest protection, covering damage to your own car as well as damage you cause to others.",
      },
      {
        heading: "What is an excess?",
        body: "An excess is an amount you may need to contribute when making a claim. A higher excess usually means a lower premium, and vice versa.",
      },
      {
        heading: "Choosing the right cover",
        body: "Weigh up the value of your car, your budget, and how much risk you're comfortable carrying yourself before choosing a policy.",
      },
    ],
    keyTakeaways: [
      "Comprehensive cover generally offers the broadest protection",
      "An excess is what you contribute when you make a claim",
      "Higher excess usually means a lower premium",
      "Match your cover to your budget and your car's value",
    ],
  },
  {
    orderIndex: 4,
    slug: "understanding-roadside-assistance",
    title: "Understanding Roadside Assistance",
    subtitle: "Help when you need it most.",
    knowledgeAreaKey: "roadside",
    // Sourced from Module_4_Roadside_Assistance.pdf
    outcomes: [
      "Know what roadside assistance can help with — flat batteries, flat tyres, lockouts and breakdowns",
      "Understand when a car may be towed instead of repaired on the spot",
      "Know what to do while you wait for help to arrive",
      "Understand what your membership plan covers",
    ],
    lessons: [
      {
        heading: "What roadside assistance covers",
        body: "Flat batteries: get a jump-start or battery replacement to get you moving. Flat tyres: assistance to change your tyre so you can get back on the road. Lockouts: locked out of your car? They'll help you get back in. Breakdowns: mechanical issues get sorted, or your car is towed safely.",
      },
      {
        heading: "Towing",
        body: "If your car can't be fixed on the spot, roadside assistance will tow it to a safe place — such as a repairer.",
      },
      {
        heading: "Available 24/7",
        body: "Emergency help is available anytime, day or night, and you can choose a membership plan that suits your needs and budget.",
      },
      {
        heading: "What to do when you break down",
        body: "Stay safe: pull over in a safe location and turn on your hazard lights. Join before you need it: sign up for Safe Start Young Driver Care online in advance. Give your location: provide accurate details so help can find you quickly. Stay with your car unless it's unsafe to do so. Know your cover: understand what your plan includes and any limits.",
      },
    ],
    keyTakeaways: [
      "Roadside assistance covers flat batteries, flat tyres, lockouts and breakdowns",
      "If it can't be fixed on the spot, your car may be towed to a safe place",
      "Emergency help is available 24/7",
      "Pull over safely, turn on hazards, and stay with your car unless it's unsafe",
    ],
  },
  {
    orderIndex: 5,
    slug: "registration-and-pink-slips",
    title: "Registration & Pink Slips",
    subtitle: "Keep your car legally on the road.",
    knowledgeAreaKey: "registration",
    // PLACEHOLDER — no source doc supplied for Module 5
    outcomes: [
      "Understand the purpose of a NSW pink slip/eSafety Check",
      "Know when a blue slip is required",
      "Understand what renewing registration involves",
      "Know the safety standards your car must meet to stay registered",
    ],
    lessons: [
      {
        heading: "What is a pink slip?",
        body: "A NSW pink slip (eSafety Check) confirms the vehicle meets required safety standards for registration. It is not a valuation and doesn't check finance owing.",
      },
      {
        heading: "What is a blue slip?",
        body: "A blue slip is generally associated with unregistered vehicles and some interstate transfers, and involves a more thorough inspection than a pink slip.",
      },
      {
        heading: "Renewing your registration",
        body: "Keep track of your renewal date, make sure any required safety inspection is current, and budget for registration alongside insurance and running costs.",
      },
    ],
    keyTakeaways: [
      "A pink slip confirms the car meets required safety standards",
      "A blue slip applies to unregistered vehicles and some interstate transfers",
      "Neither slip checks the car's value or finance owing",
      "Track your renewal date so registration doesn't lapse",
    ],
  },
  {
    orderIndex: 6,
    slug: "car-maintenance-and-safety",
    title: "Car Maintenance & Safety",
    subtitle: "Look after your car so it looks after you.",
    knowledgeAreaKey: "maintenance_safety",
    // PLACEHOLDER — no source doc supplied for Module 6
    outcomes: [
      "Understand why following the manufacturer's service schedule matters",
      "Know which parts of the car to check regularly",
      "Understand how maintenance affects safety, reliability and resale value",
      "Build a habit of routine checks before driving",
    ],
    lessons: [
      {
        heading: "Why servicing schedules matter",
        body: "Following the manufacturer's recommended servicing schedule helps maintain reliability, safety and vehicle value over time.",
      },
      {
        heading: "What to check regularly",
        body: "Make a habit of checking tyres, fluids, lights and battery condition — these are the areas most likely to cause an unexpected breakdown or safety issue.",
      },
      {
        heading: "Building the habit",
        body: "Set a reminder to run through these checks monthly, not just at service time, so small issues get caught early.",
      },
    ],
    keyTakeaways: [
      "Stick to the manufacturer's recommended service schedule",
      "Regularly check tyres, fluids, lights and battery condition",
      "Good maintenance protects safety, reliability and resale value",
      "Monthly checks catch small issues before they become breakdowns",
    ],
  },
  {
    orderIndex: 7,
    slug: "practical-tips-on-maintaining-your-car-safely",
    title: "Practical Tips on Maintaining Your Car Safely",
    subtitle: "Hands-on skills every young driver should know.",
    knowledgeAreaKey: "practical_maintenance",
    // Sourced from Module_7_Practical_Tips_on_Maintaining_Your_Car_Safely.pdf
    outcomes: [
      "Know how to change a flat tyre safely",
      "Know how to check and inflate tyres correctly, and when to do it",
      "Know which fluids to check and how",
      "Know which jobs are safe to DIY and which need a qualified mechanic",
    ],
    lessons: [
      {
        heading: "Changing a flat tyre",
        body: "Stop safely, use the jack, loosen the nuts. Fit the spare wheel and tighten the nuts. Follow temporary speed limits until you can get the tyre properly repaired or replaced.",
      },
      {
        heading: "Checking & inflating tyres",
        body: "Find the correct pressure and use an air pump. Check pressure when the tyres are cold. Inspect tread depth and wear regularly.",
      },
      {
        heading: "Checking fluids",
        body: "Check engine oil, coolant and washer fluid yourself. Brake fluid should only be checked visually — if it looks low, see a mechanic.",
      },
      {
        heading: "Battery checks",
        body: "Check for corrosion, look for signs of a weak battery, and keep terminals clean.",
      },
      {
        heading: "Lights & indicators",
        body: "Check headlights, brake lights, indicators and reverse lights, and make sure your hazard lights work.",
      },
      {
        heading: "Emergency kit",
        body: "Carry a spare tyre, jack, wheel brace and torch, jumper leads, gloves and a hi-vis vest, plus a first aid kit and a charged phone.",
      },
      {
        heading: "Safety first — never DIY",
        body: "Leave brake repairs, airbag systems, steering or suspension repairs, and high-voltage EV or fuel system repairs to a qualified mechanic. If unsure, always get it checked by a professional.",
      },
      {
        heading: "Smart checks before every drive",
        body: "Walk around the car: check for flat tyres, fluid leaks, damage and broken lights. Inside the car: check dashboard warning lights, mirrors, seat position and fuel level. Monthly: check tyre pressure, washer bottle, lights, battery condition and tyre tread.",
      },
    ],
    keyTakeaways: [
      "Always check tyre pressure when tyres are cold",
      "Engine oil, coolant and washer fluid are safe to check yourself — leave brake fluid to a mechanic",
      "Never attempt brake, airbag, steering, suspension or EV/fuel system repairs yourself",
      "Carry an emergency kit and run smart checks before every drive",
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
