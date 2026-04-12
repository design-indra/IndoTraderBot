/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@tensorflow/tfjs'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        fs: false,
        path: false,
      };
    }
    // Ignore tensorflow on both client and server during webpack build
    // It is loaded at runtime via dynamic import only
    config.plugins.push(
      new (require('webpack').IgnorePlugin)({
        resourceRegExp: /^@tensorflow\/tfjs/,
      })
    );
    return config;
  },
};

module.exports = nextConfig;
