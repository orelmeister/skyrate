export type StateData = {
  slug: string;
  name: string;
  code: string;
  entityCount: number;
  schoolCount: number;
  libraryCount: number;
  fundingHighlight: string;
};

export const STATES: StateData[] = [
  { slug: "alabama", name: "Alabama", code: "AL", entityCount: 810, schoolCount: 745, libraryCount: 65, fundingHighlight: "$120M+" },
  { slug: "alaska", name: "Alaska", code: "AK", entityCount: 280, schoolCount: 245, libraryCount: 35, fundingHighlight: "$45M+" },
  { slug: "arizona", name: "Arizona", code: "AZ", entityCount: 920, schoolCount: 860, libraryCount: 60, fundingHighlight: "$185M+" },
  { slug: "arkansas", name: "Arkansas", code: "AR", entityCount: 640, schoolCount: 590, libraryCount: 50, fundingHighlight: "$95M+" },
  { slug: "california", name: "California", code: "CA", entityCount: 4200, schoolCount: 3950, libraryCount: 250, fundingHighlight: "$900M+" },
  { slug: "colorado", name: "Colorado", code: "CO", entityCount: 820, schoolCount: 760, libraryCount: 60, fundingHighlight: "$155M+" },
  { slug: "connecticut", name: "Connecticut", code: "CT", entityCount: 620, schoolCount: 570, libraryCount: 50, fundingHighlight: "$110M+" },
  { slug: "delaware", name: "Delaware", code: "DE", entityCount: 210, schoolCount: 185, libraryCount: 25, fundingHighlight: "$40M+" },
  { slug: "florida", name: "Florida", code: "FL", entityCount: 3100, schoolCount: 2900, libraryCount: 200, fundingHighlight: "$650M+" },
  { slug: "georgia", name: "Georgia", code: "GA", entityCount: 1800, schoolCount: 1680, libraryCount: 120, fundingHighlight: "$360M+" },
  { slug: "hawaii", name: "Hawaii", code: "HI", entityCount: 250, schoolCount: 225, libraryCount: 25, fundingHighlight: "$50M+" },
  { slug: "idaho", name: "Idaho", code: "ID", entityCount: 380, schoolCount: 345, libraryCount: 35, fundingHighlight: "$60M+" },
  { slug: "illinois", name: "Illinois", code: "IL", entityCount: 2400, schoolCount: 2200, libraryCount: 200, fundingHighlight: "$470M+" },
  { slug: "indiana", name: "Indiana", code: "IN", entityCount: 1100, schoolCount: 1020, libraryCount: 80, fundingHighlight: "$195M+" },
  { slug: "iowa", name: "Iowa", code: "IA", entityCount: 720, schoolCount: 660, libraryCount: 60, fundingHighlight: "$110M+" },
  { slug: "kansas", name: "Kansas", code: "KS", entityCount: 650, schoolCount: 595, libraryCount: 55, fundingHighlight: "$100M+" },
  { slug: "kentucky", name: "Kentucky", code: "KY", entityCount: 870, schoolCount: 800, libraryCount: 70, fundingHighlight: "$150M+" },
  { slug: "louisiana", name: "Louisiana", code: "LA", entityCount: 970, schoolCount: 900, libraryCount: 70, fundingHighlight: "$185M+" },
  { slug: "maine", name: "Maine", code: "ME", entityCount: 340, schoolCount: 305, libraryCount: 35, fundingHighlight: "$50M+" },
  { slug: "maryland", name: "Maryland", code: "MD", entityCount: 950, schoolCount: 875, libraryCount: 75, fundingHighlight: "$185M+" },
  { slug: "massachusetts", name: "Massachusetts", code: "MA", entityCount: 1250, schoolCount: 1150, libraryCount: 100, fundingHighlight: "$240M+" },
  { slug: "michigan", name: "Michigan", code: "MI", entityCount: 1900, schoolCount: 1750, libraryCount: 150, fundingHighlight: "$360M+" },
  { slug: "minnesota", name: "Minnesota", code: "MN", entityCount: 1050, schoolCount: 965, libraryCount: 85, fundingHighlight: "$195M+" },
  { slug: "mississippi", name: "Mississippi", code: "MS", entityCount: 640, schoolCount: 590, libraryCount: 50, fundingHighlight: "$110M+" },
  { slug: "missouri", name: "Missouri", code: "MO", entityCount: 1100, schoolCount: 1010, libraryCount: 90, fundingHighlight: "$200M+" },
  { slug: "montana", name: "Montana", code: "MT", entityCount: 330, schoolCount: 295, libraryCount: 35, fundingHighlight: "$50M+" },
  { slug: "nebraska", name: "Nebraska", code: "NE", entityCount: 510, schoolCount: 465, libraryCount: 45, fundingHighlight: "$80M+" },
  { slug: "nevada", name: "Nevada", code: "NV", entityCount: 570, schoolCount: 520, libraryCount: 50, fundingHighlight: "$105M+" },
  { slug: "new-hampshire", name: "New Hampshire", code: "NH", entityCount: 340, schoolCount: 305, libraryCount: 35, fundingHighlight: "$55M+" },
  { slug: "new-jersey", name: "New Jersey", code: "NJ", entityCount: 1650, schoolCount: 1520, libraryCount: 130, fundingHighlight: "$340M+" },
  { slug: "new-mexico", name: "New Mexico", code: "NM", entityCount: 480, schoolCount: 435, libraryCount: 45, fundingHighlight: "$90M+" },
  { slug: "new-york", name: "New York", code: "NY", entityCount: 4500, schoolCount: 4200, libraryCount: 300, fundingHighlight: "$980M+" },
  { slug: "north-carolina", name: "North Carolina", code: "NC", entityCount: 1800, schoolCount: 1675, libraryCount: 125, fundingHighlight: "$360M+" },
  { slug: "north-dakota", name: "North Dakota", code: "ND", entityCount: 270, schoolCount: 240, libraryCount: 30, fundingHighlight: "$40M+" },
  { slug: "ohio", name: "Ohio", code: "OH", entityCount: 2400, schoolCount: 2220, libraryCount: 180, fundingHighlight: "$465M+" },
  { slug: "oklahoma", name: "Oklahoma", code: "OK", entityCount: 760, schoolCount: 700, libraryCount: 60, fundingHighlight: "$120M+" },
  { slug: "oregon", name: "Oregon", code: "OR", entityCount: 720, schoolCount: 655, libraryCount: 65, fundingHighlight: "$130M+" },
  { slug: "pennsylvania", name: "Pennsylvania", code: "PA", entityCount: 2700, schoolCount: 2500, libraryCount: 200, fundingHighlight: "$530M+" },
  { slug: "rhode-island", name: "Rhode Island", code: "RI", entityCount: 250, schoolCount: 225, libraryCount: 25, fundingHighlight: "$50M+" },
  { slug: "south-carolina", name: "South Carolina", code: "SC", entityCount: 870, schoolCount: 800, libraryCount: 70, fundingHighlight: "$165M+" },
  { slug: "south-dakota", name: "South Dakota", code: "SD", entityCount: 290, schoolCount: 257, libraryCount: 33, fundingHighlight: "$42M+" },
  { slug: "tennessee", name: "Tennessee", code: "TN", entityCount: 1100, schoolCount: 1020, libraryCount: 80, fundingHighlight: "$210M+" },
  { slug: "texas", name: "Texas", code: "TX", entityCount: 5800, schoolCount: 5500, libraryCount: 300, fundingHighlight: "$1.2B+" },
  { slug: "utah", name: "Utah", code: "UT", entityCount: 580, schoolCount: 535, libraryCount: 45, fundingHighlight: "$105M+" },
  { slug: "vermont", name: "Vermont", code: "VT", entityCount: 280, schoolCount: 250, libraryCount: 30, fundingHighlight: "$42M+" },
  { slug: "virginia", name: "Virginia", code: "VA", entityCount: 1500, schoolCount: 1380, libraryCount: 120, fundingHighlight: "$295M+" },
  { slug: "washington", name: "Washington", code: "WA", entityCount: 1200, schoolCount: 1100, libraryCount: 100, fundingHighlight: "$235M+" },
  { slug: "west-virginia", name: "West Virginia", code: "WV", entityCount: 420, schoolCount: 380, libraryCount: 40, fundingHighlight: "$70M+" },
  { slug: "wisconsin", name: "Wisconsin", code: "WI", entityCount: 1050, schoolCount: 965, libraryCount: 85, fundingHighlight: "$195M+" },
  { slug: "wyoming", name: "Wyoming", code: "WY", entityCount: 210, schoolCount: 187, libraryCount: 23, fundingHighlight: "$32M+" },
];

export function getStateBySlug(slug: string): StateData | undefined {
  return STATES.find((s) => s.slug === slug);
}
