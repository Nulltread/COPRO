const { createApp } = require('./app');
const { demarrerTaches } = require('./taches');

const PORT = process.env.PORT || 3000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`COPRO — application démarrée sur le port ${PORT}`);
});

// Taches periodiques : peremption des rattachements, archivage auto (specs 19-20).
demarrerTaches();
