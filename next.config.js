/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
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
    config.plugins.push(
      new (require('webpack').IgnorePlugin)({
        resourceRegExp: /^@tensorflow\/tfjs/,
      })
    );
    return config;
  },
};

module.exports = nextConfig;
