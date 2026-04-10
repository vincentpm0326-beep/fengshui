module.exports = {
  apps: [{
    name: 'cma',
    script: 'proxy.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      INTERNAL_TOKEN: 'cma-secure-token-2026',
      ADMIN_SECRET: 'cma-admin-2026',
      // API Key 在服务器上通过环境变量单独设置，不提交到 GitHub
    }
  }]
};
