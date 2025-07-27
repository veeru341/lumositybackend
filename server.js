const express = require('express');
const runLumosityStats = require('./runStats');
const results = require('./results');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/api/lumosity-stats', async (req, res) => {
  try {
    const result = await runLumosityStats();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/results', (req, res) => {
  try {
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(3000, () => {
  console.log('🚀 Server listening at http://localhost:3000');
});


