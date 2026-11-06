const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;
const app = createApp();

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  try {
    require('web-push').setVapidDetails(
      'mailto:contact@copro.local',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  } catch (e) { /* push désactivé si clés absentes */ }
}

app.listen(PORT, () => {
  console.log(`COPRO — application démarrée sur le port ${PORT}`);
});
