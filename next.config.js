/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@tensorflow/tfjs', '@tensorflow/tfjs-node'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        fs: false,
        path: false,
      };
      // Ignore tensorflow on client side — only used server-side
      config.plugins.push(
        new (require('webpack').IgnorePlugin)({
          resourceRegExp: /^@tensorflow/,
        })
      );
    }
    return config;
  },
};

module.exports = nextConfig;
