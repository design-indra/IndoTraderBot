module.exports = {
  // other config options...
  staticPageGenerationTimeout: 60,
  webpack: (config) => {
    config.resolve.fallback = {
      fs: false,
      path: false,
      // any other fallbacks needed
    };
    return config;
  }
};