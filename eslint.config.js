const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat.js');

// 原因：遵循 ADR-0002，同时使用物理路径解析 (import/no-restricted-paths) 与模块模式拦截，彻底封死别名与相对路径跨层越权引用
module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['node_modules/**', '.expo/**', '.claude/**', 'ios/**', 'android/**', 'coverage/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.type='MemberExpression'][object.object.name='process'][object.property.name='env'][property.name='NODE_ENV']",
          message:
            '严禁在 src/ 生产代码中分支嗅探 process.env.NODE_ENV；测试差异必须通过 AppRuntimeOverrides / createTestRuntime 显式注入。',
        },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/core',
              from: './src/shared',
              message: 'Template Core (src/core) 严禁引用 Shared Layer (src/shared)。',
            },
            {
              target: './src/core',
              from: './src/features',
              message: 'Template Core (src/core) 严禁引用 Feature Slice (src/features)。',
            },
            {
              target: './src/core',
              from: './src/app',
              message: 'Template Core (src/core) 严禁引用 Route Shell (src/app)。',
            },
            {
              target: './src/core',
              from: './app.identity.ts',
              message:
                'Template Core (src/core) 严禁直接耦合 app.identity.ts，请通过运行时接缝注入。',
            },
            {
              target: './src/shared',
              from: './src/features',
              message: 'Shared Layer (src/shared) 严禁反向引用 Feature Slice (src/features)。',
            },
            {
              target: './src/shared',
              from: './src/app',
              message: 'Shared Layer (src/shared) 严禁反向引用 Route Shell (src/app)。',
            },
            {
              target: './src/features',
              from: './src/app',
              message: 'Feature Slice (src/features) 严禁反向引用 Route Shell (src/app)。',
            },
            {
              target: './src/core/runtime',
              from: './src/core/capabilities',
              message:
                '内核运行时严禁静态导入具体 Capability Module，确保派生应用可直接物理删除任意能力子目录而不破坏编译。',
            },
            {
              target: './src/core/permissions',
              from: './src/core/capabilities',
              message:
                '权限协调器严禁反向依赖具体 Capability Module，能力权限探针必须由各模块自身注入。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/shared',
                '@/shared/*',
                '@/features',
                '@/features/*',
                '@/app',
                '@/app/*',
                '@root/app.identity',
                '@root/src/shared/*',
                '@root/src/features/*',
                '@root/src/app/*',
              ],
              message: 'Template Core (src/core) 严禁反向引用上层模块或直接耦合 app.identity。',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'app.config.ts',
      'config/**/*.ts',
      'src/core/capabilities/**/*.{ts,tsx}',
      'tests/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/features',
                '@/features/*',
                '@/app',
                '@/app/*',
                '@root/src/features/*',
                '@root/src/app/*',
              ],
              message: 'Shared Layer (src/shared) 严禁反向引用 Feature Slice 或 Route Shell。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app', '@/app/*', '@root/src/app/*'],
              message: 'Feature Slice (src/features) 严禁反向引用 Route Shell (src/app)。',
            },
            {
              group: ['@/features/*/**', '@root/src/features/*/**', '../../*', '../../**'],
              message:
                '严禁跨 Feature Slice 引用其他业务切片内部文件（含相对路径逃逸）；跨切片共享请下沉至 Shared Layer (@/shared)。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/app/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*/**', '@root/src/features/*/**'],
              message:
                '外部调用方（Route Shell 与测试）只能通过 Feature Slice 公共入口 (@/features/<slice>) 导入，禁止深层引用切片私有文件。',
            },
          ],
        },
      ],
    },
  },
]);
