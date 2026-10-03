const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    rules: {
      // Reanimated shared values are mutable handles by design.
      'react-hooks/immutability': 'off',
    },
  },
]);
