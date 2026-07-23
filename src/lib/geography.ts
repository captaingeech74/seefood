export const ABOVE_FOLD_PHOTO_TARGET = 7;
export const US_RESTAURANT_PLANNING_TOTAL = 750_000;
export const MAJOR_METRO_RESTAURANT_TARGET = 450_000;

export type CoverageScope = "temecula" | "zip" | "metro" | "state" | "nationwide";

export interface GeoBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface CoverageGeography {
  scope: CoverageScope;
  label: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  bounds?: GeoBounds;
}

export const TEMECULA_GEOGRAPHY: CoverageGeography = {
  scope: "temecula",
  label: "Temecula, California",
  lat: 33.4936,
  lng: -117.1484,
  radiusKm: 15,
};

export const STATE_NAMES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming",
] as const;

