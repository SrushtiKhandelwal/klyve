// PM2 settings for Klyve. Start with:  pm2 start ecosystem.config.cjs
// ONE instance only (fork mode): the email-sending worker runs inside the app,
// and two copies could send the same email twice.
module.exports = {
  apps: [
    {
      name: "klyve",
      cwd: "/home/ubuntu/klyve", // the app folder on the server
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000 -H 127.0.0.1",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      // Give the worker time to finish an email that's being sent.
      kill_timeout: 30000,
      max_memory_restart: "1200M",
      env: { NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
      time: true,
    },
  ],
};
