const withPWA = require("next-pwa");
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig = {
  ...withPWA({
    dest: "public",
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === "development",
    // Offline fallback configuration
    fallbacks: {
      document: '/offline',
      pages: [
        {
          urlPattern: /^.*\/books.*$/,
          page: '/books-offline'
        },
        {
          urlPattern: /^.*\/manage.*$/,
          page: '/manage-offline'
        }
      ]
    },
    runtimeCaching: [
      // Cache Google Fonts
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-cache',
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
          }
        }
      },
      // Cache font files
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-webfonts',
          expiration: {
            maxEntries: 30,
            maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
          }
        }
      },
      // Cache API routes for books
      {
        urlPattern: /^.*\/api\/books.*$/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'books-api-cache',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 5 // 5 minutes
          },
          networkTimeoutSeconds: 3
        }
      },
      // Cache API routes for reading data
      {
        urlPattern: /^.*\/api\/reading.*$/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'reading-api-cache',
          expiration: {
            maxEntries: 20,
            maxAgeSeconds: 60 * 2 // 2 minutes
          },
          networkTimeoutSeconds: 3
        }
      },
      // Cache static images
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-images-cache',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
          }
        }
      },
      // Cache pages for offline viewing
      {
        urlPattern: /^.*\/(reading|manage|login).*$/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages-cache',
          expiration: {
            maxEntries: 20,
            maxAgeSeconds: 60 * 60 * 24 // 24 hours
          },
          networkTimeoutSeconds: 3
        }
      }
    ]
  }),
  reactStrictMode: false,
  // Bundle optimization settings
  experimental: {
    // Optimize package imports for better tree shaking
    optimizePackageImports: ['lucide-react', '@neondatabase/serverless']
  },
  turbopack:{
    
  }
};

module.exports = withBundleAnalyzer(nextConfig);