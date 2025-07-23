const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { MessagingResponse } = require('twilio').twiml;
const runLumosityStats = require('./runStats');

const app = express();

// Middleware
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Route: Manual stats fetch from frontend
app.get('/api/lumosity-stats', async (req, res) => {
  try {
    const result = await runLumosityStats();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Route: WhatsApp Webhook
app.post('/whatsapp', async (req, res) => {
  const message = req.body.Body?.trim().toLowerCase();
  const from = req.body.From;
  const twiml = new MessagingResponse();

  console.log(`📩 Received from ${from}: ${message}`);

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
      console.error('❌ Error:', err);
      twiml.message(`❌ Error: ${err.message}`);
    }
  } else {
    twiml.message('👋 Send *get stats* to receive the latest Lumosity results.');
  }

  res.set('Content-Type', 'text/xml');
  res.send(twiml.toString());
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
