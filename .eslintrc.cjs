module.exports = {
  root: true,
  env: { node: true, browser: true, es2021: true },
  extends: ['eslint:recommended'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-unused-vars': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn'
  },
  ignorePatterns: ['dist/', 'out/', 'node_modules/']
}
