import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import typescriptEslint from 'typescript-eslint';

export default [
  ...nextCoreWebVitals,
  {
    plugins: {
      '@typescript-eslint': typescriptEslint.plugin,
    },
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/dashboard/src/app/api/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: "CallExpression[callee.name='callPipelineStage']",
          message:
            'callPipelineStage bypasses typed agent contracts. Use runDesignPipeline from @agentforge/agents-ux instead. See docs/active-plan/unify-pipeline/execution-plan.md.',
        },
      ],
    },
  },
];
