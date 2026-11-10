import globals from 'globals';
export default [
  {ignores:['node_modules/**']},
  {files:['**/*.mjs','**/*.js'],languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:{...globals.node,...globals.browser,DucoroI18n:'readonly',DucoroUIReady:'readonly',DucoroLanguageReady:'readonly',DucoroDefaultOptions:'readonly',DucoroResources:'readonly',DucoroPreview:'readonly',DucoroWorkspace:'readonly',DucoroBackupFiles:'readonly',DucoroPlans:'readonly',ducoroApi:'readonly',magpie:'readonly'}},rules:{'no-undef':'error','no-unreachable':'error','no-dupe-args':'error','no-dupe-keys':'error','no-constant-condition':['error',{checkLoops:false}]}}
];
