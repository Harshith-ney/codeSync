module.exports = {
  apps: [
    {
      name: 'codesync',
      cwd: '/home/ubuntu/codesync/server',
      script: 'dist/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '512M',
      time: true,
    },
  ],
};
