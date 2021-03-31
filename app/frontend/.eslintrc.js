module.exports = {
  "root": true,
  "env": {
    "node": true
  },
  "extends": [
    "plugin:vue/essential",
    "eslint:recommended"
  ],
  "rules": {
    "comma-dangle": ["error", "never"],
    "comma-spacing": ["error", {"after": true, "before": false}],
    "no-console": ["error", { "allow": ["warn", "error"] }],
    "no-extra-semi": "error",
    "no-unexpected-multiline": "error",
    "no-unreachable": "error",
    "quotes": ["error", "double"],
    "semi": ["error", "always"],
    "semi-spacing": ["error", {"after": true, "before": false}],
    "semi-style": ["error", "last"],
    "space-before-blocks": ["error", "always"],
    "space-before-function-paren": ["error", "never"],
    "space-in-parens": ["error", "never"],
    "space-infix-ops": "error"
  },
  "parserOptions": {
    "parser": "babel-eslint"
  }
};
