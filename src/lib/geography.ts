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

export interface MajorMetro {
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
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

// Practical V1 metro footprints centered on the principal city. Official CBSA
// county polygons remain the long-term reporting boundary; these make every
// top-50 control useful today without depending on a paid geocoder.
export const MAJOR_METROS: MajorMetro[] = [
  ["New York-Newark-Jersey City", 40.7128, -74.0060, 85],
  ["Los Angeles-Long Beach-Anaheim", 34.0522, -118.2437, 90],
  ["Chicago-Naperville-Elgin", 41.8781, -87.6298, 75],
  ["Dallas-Fort Worth-Arlington", 32.7767, -96.7970, 85],
  ["Houston-Pasadena-The Woodlands", 29.7604, -95.3698, 85],
  ["Atlanta-Sandy Springs-Roswell", 33.7490, -84.3880, 80],
  ["Washington-Arlington-Alexandria", 38.9072, -77.0369, 75],
  ["Miami-Fort Lauderdale-West Palm Beach", 25.7617, -80.1918, 90],
  ["Philadelphia-Camden-Wilmington", 39.9526, -75.1652, 70],
  ["Phoenix-Mesa-Chandler", 33.4484, -112.0740, 80],
  ["Boston-Cambridge-Newton", 42.3601, -71.0589, 70],
  ["Riverside-San Bernardino-Ontario", 33.9806, -117.3755, 85],
  ["San Francisco-Oakland-Berkeley", 37.7749, -122.4194, 70],
  ["Detroit-Warren-Dearborn", 42.3314, -83.0458, 65],
  ["Seattle-Tacoma-Bellevue", 47.6062, -122.3321, 75],
  ["Minneapolis-St. Paul-Bloomington", 44.9778, -93.2650, 70],
  ["Tampa-St. Petersburg-Clearwater", 27.9506, -82.4572, 65],
  ["San Diego-Chula Vista-Carlsbad", 32.7157, -117.1611, 70],
  ["Denver-Aurora-Centennial", 39.7392, -104.9903, 70],
  ["Orlando-Kissimmee-Sanford", 28.5383, -81.3792, 65],
  ["Charlotte-Concord-Gastonia", 35.2271, -80.8431, 65],
  ["Baltimore-Columbia-Towson", 39.2904, -76.6122, 60],
  ["St. Louis", 38.6270, -90.1994, 65],
  ["San Antonio-New Braunfels", 29.4241, -98.4936, 70],
  ["Austin-Round Rock-San Marcos", 30.2672, -97.7431, 65],
  ["Portland-Vancouver-Hillsboro", 45.5152, -122.6784, 65],
  ["Sacramento-Roseville-Folsom", 38.5816, -121.4944, 65],
  ["Pittsburgh", 40.4406, -79.9959, 60],
  ["Las Vegas-Henderson-North Las Vegas", 36.1699, -115.1398, 65],
  ["Cincinnati", 39.1031, -84.5120, 60],
  ["Kansas City", 39.0997, -94.5786, 65],
  ["Columbus", 39.9612, -82.9988, 60],
  ["Indianapolis-Carmel-Greenwood", 39.7684, -86.1581, 60],
  ["Cleveland", 41.4993, -81.6944, 60],
  ["Nashville-Davidson-Murfreesboro-Franklin", 36.1627, -86.7816, 70],
  ["San Jose-Sunnyvale-Santa Clara", 37.3382, -121.8863, 55],
  ["Virginia Beach-Chesapeake-Norfolk", 36.8529, -75.9780, 60],
  ["Providence-Warwick", 41.8240, -71.4128, 50],
  ["Jacksonville", 30.3322, -81.6557, 65],
  ["Milwaukee-Waukesha", 43.0389, -87.9065, 55],
  ["Raleigh-Cary", 35.7796, -78.6382, 60],
  ["Oklahoma City", 35.4676, -97.5164, 65],
  ["Memphis", 35.1495, -90.0490, 60],
  ["Richmond", 37.5407, -77.4360, 55],
  ["Louisville-Jefferson County", 38.2527, -85.7585, 55],
  ["New Orleans-Metairie", 29.9511, -90.0715, 55],
  ["Salt Lake City-Murray", 40.7608, -111.8910, 60],
  ["Hartford-West Hartford-East Hartford", 41.7658, -72.6734, 50],
  ["Buffalo-Cheektowaga", 42.8864, -78.8784, 50],
  ["Birmingham", 33.5186, -86.8104, 55],
].map(([name, lat, lng, radiusKm]) => ({ name: String(name), lat: Number(lat), lng: Number(lng), radiusKm: Number(radiusKm) }));

export const STATE_BOUNDS: Partial<Record<(typeof STATE_NAMES)[number], GeoBounds>> = {
  California: { minLat: 32.5, maxLat: 42.1, minLng: -124.6, maxLng: -114.0 },
};
