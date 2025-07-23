const express = require('express');
const runLumosityStats = require('./runStats');
const cors = require('cors');
const { MessagingResponse } = require('twilio').twiml;

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

app.post('/whatsapp', async (req, res) => {
  const message = req.body.Body?.trim().toLowerCase();
  const from = req.body.From;
  const twiml = new MessagingResponse();

  console.log(`📩 WhatsApp message from ${from}: ${message}`);

  if (message === 'get stats') {
    try {
      const result = await runLumosityStats();

      let responseText = '';
      for (const [name, stats] of Object.entries(result)) {
        responseText += `*${name}*\n`;
        for (const [label, value] of Object.entries(stats)) {
          responseText += `- ${label}: ${value}\n`;
        }
        responseText += '\n';
      }

      twiml.message(responseText || 'No stats available.');
    } catch (err) {
      console.error('❌ Error fetching stats:', err);
      twiml.message('❌ Failed to get stats. Try again later.');
    }
  } else {
    twiml.message('👋 Send *get stats* to receive your Lumosity results.');
  }

  res.set('Content-Type', 'text/xml');
  res.send(twiml.toString());
});

app.listen(3000, () => {
  console.log('🚀 Server listening at http://localhost:3000');
});