// Expo SDK 52 resuelve los alias "@/*" de tsconfig sin plugins extra.
module.exports = (api) => {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
