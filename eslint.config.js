import { defineConfig, globalIgnores } from 'eslint/config';
import promise from 'eslint-plugin-promise';
import jsdoc from 'eslint-plugin-jsdoc';
import mochaPlugin from 'eslint-plugin-mocha';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([
    globalIgnores([`*.ts`, `coverage/`]),
    mochaPlugin.configs.recommended,
    {
        extends: compat.extends(`eslint:recommended`, `plugin:promise/recommended`),

        plugins: {
            promise,
            jsdoc,
            '@stylistic': stylistic,
            mocha: mochaPlugin
        },

        languageOptions: {
            globals: {
                ...globals.node,
                expect: `readonly`,
                testTimeout: `readonly`
            },

            ecmaVersion: `latest`,
            sourceType: `module`,
        },

        rules: {
            '@stylistic/indent': [`error`, 4, {
                SwitchCase: 1,
            }],
            '@stylistic/object-curly-spacing': [`error`, `always`],
            '@stylistic/quotes': [`error`, `backtick`],
            '@stylistic/semi': [`error`, `always`],
            'no-var': [`error`],
            eqeqeq: [`error`],
            '@stylistic/arrow-parens': [`error`, `always`],
            'no-async-promise-executor': [`off`],
            'no-prototype-builtins': [`off`],
            'no-unused-vars': [`error`, {
                args: `after-used`,
                caughtErrors: `none`
            }],
            'prefer-const': [`error`],
            'prefer-template': [`error`],
            'promise/always-return': [`off`],
            'promise/no-nesting': [`off`],
            'promise/no-callback-in-promise': [`off`],
            'jsdoc/require-returns': [`warn`],
            'mocha/no-mocha-arrows': [`off`],
            'mocha/no-hooks-for-single-case': [`off`],
            'mocha/no-setup-in-describe': [`off`],
            'mocha/no-top-level-hooks': [`off`]
        }
    }
]);
