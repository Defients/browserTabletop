import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config({ignores:['dist/**','node_modules/**','artifacts/**','playwright-report/**','test-results/**','release/**']},js.configs.recommended,...tseslint.configs.recommended,{files:['**/*.{ts,tsx}'],rules:{'@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}]}},{files:['**/*.js'],languageOptions:{globals:{process:'readonly',console:'readonly',URL:'readonly'}}});
