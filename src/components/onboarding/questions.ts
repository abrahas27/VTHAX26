// The 8 career questions (spec F3). Copy lives here so the wizard stays presentational.

export interface Choice {
  value: string;
  label: string;
}

export const SEEKING: Choice[] = [
  { value: "internship", label: "Internship (Summer 2027)" },
  { value: "full_time", label: "Full-time (2027/28)" },
  { value: "research", label: "Research position" },
  { value: "exploring", label: "Just exploring" },
];

export const ENERGIZERS: Choice[] = [
  { value: "Building things", label: "Building things" },
  { value: "Analyzing data", label: "Analyzing data" },
  { value: "Persuading and leading", label: "Persuading and leading" },
  { value: "Designing experiences", label: "Designing experiences" },
  { value: "Helping people", label: "Helping people" },
  { value: "Solving puzzles", label: "Solving puzzles" },
];

export const INDUSTRIES: Choice[] = [
  "Tech",
  "Finance",
  "Consulting",
  "Government and defense",
  "Energy",
  "Healthcare",
  "Consumer",
  "Startups",
].map((v) => ({ value: v, label: v }));

export const LOCATIONS: Choice[] = [
  "NoVA/DC",
  "NYC",
  "Charlotte",
  "Richmond",
  "Remote",
  "Anywhere",
].map((v) => ({ value: v, label: v }));

export const HOURS: Choice[] = [
  { value: "1-2", label: "1-2 hours" },
  { value: "3-5", label: "3-5 hours" },
  { value: "6-10", label: "6-10 hours" },
  { value: "10+", label: "10+ hours" },
];

export const FLAGS: {
  value: "needsSponsorship" | "gpaConcerns" | "firstGen" | "transfer";
  label: string;
}[] = [
  { value: "needsSponsorship", label: "I need visa sponsorship" },
  { value: "gpaConcerns", label: "I have GPA concerns" },
  { value: "firstGen", label: "I am a first-generation student" },
  { value: "transfer", label: "I am a transfer student" },
];

/** Steps of the build sequence shown while the profile is computed (spec 5.7). */
export const BUILD_STEPS = [
  "Reading your resume",
  "Mapping your skills",
  "Scanning VT events",
  "Finding recruiters",
  "Building your roadmap",
];
