export default {
  "*.{js,mjs,cjs,ts,mts,cts}": ["prettier --write", "eslint --fix"],
  "*.{css,scss,json,jsonc,md,yml,yaml}": ["prettier --write"],
};
