module.exports = {
    "env": {
        "browser": true,
        "es2021": true
    },
    "extends": [
        "eslint:recommended",
        "plugin:vue/vue3-essential"
    ],
    "parserOptions": {
        "ecmaVersion": "latest",
        "sourceType": "module"
    },
    "plugins": [
        "vue"
    ],
    "rules": {
        "no-unused-vars": "warn",
        "no-undef": "off" // Turned off because we rely on globals like vis, Vue, graphData
    },
    "globals": {
        "vis": "readonly",
        "Vue": "readonly",
        "graphData": "readonly",
        "tailwind": "readonly"
    }
}
