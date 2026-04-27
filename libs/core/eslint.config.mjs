import nx from '@nx/eslint-plugin';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...nx.configs['flat/react'],
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {},
  },
  prettierRecommended,
];
