module.exports = {
  apps: [{
    name: "luminet-web",
    script: "node_modules/next/dist/bin/next",
    args: "start -p 3001 -H 0.0.0.0",
    cwd: "/var/www/luminet/luminet-web",
    env: {
      NODE_ENV: "production",
      DATABASE_URL: "file:/var/www/luminet/luminet-web/data/luminet.db",
      JWT_SECRET: process.env.JWT_SECRET,
      COOKIE_NAME: "luminet_session",
    },
    max_restarts: 5,
    min_uptime: "10s",
  }],
};