/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'maps.googleapis.com' },
      { protocol: 'https', hostname: 'places.googleapis.com' },
      { protocol: 'https', hostname: 's3-media*.yelpcdn.com' },
      { protocol: 'https', hostname: '*.yelpcdn.com' },
    ],
  },
};

module.exports = nextConfig;
