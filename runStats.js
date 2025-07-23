const puppeteer = require('puppeteer');
const fs = require('fs');

async function runLumosityStats() {
  const accounts = JSON.parse(fs.readFileSync('accounts.json', 'utf-8'));
  let allResults = {};

  try {
    if (fs.existsSync('results.js')) {
      const existing = require('./results.js');
      if (typeof existing === 'object') {
        allResults = existing;
      }
    }
  } catch (e) {
    allResults = {};
  }

  for (const account of accounts) {
    let success = false;
    let displayName = null;
    let stats = null;

    // ✅ FIXED: Add args to support Railway / Linux headless environment
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: 'new', // or true if needed
    });

    const page = await browser.newPage();

    try {
      console.log(`🌐 Logging in as: ${account.email}`);
      await page.goto('https://app.lumosity.com/login', { waitUntil: 'networkidle2' });
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Click "Email" button if needed
      try {
        const emailButtons = await page.$$('button span');
        for (const btn of emailButtons) {
          const text = await page.evaluate(el => el.innerText.toLowerCase(), btn);
          if (text.includes('email')) {
            await (await btn.getProperty('parentNode')).click();
            console.log('✅ Clicked on "Log in with Email"');
            break;
          }
        }
      } catch {
        console.log('⚠ Email login button not found or already open');
      }

      await page.waitForSelector('input#email', { timeout: 20000 });
      await page.type('#email', account.email, { delay: 50 });
      await page.type('#password', account.password, { delay: 50 });

      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.innerText.trim(), btn);
        if (text === 'Log In') {
          await btn.click();
          console.log('🔓 Submitted login');
          break;
        }
      }

      await page.waitForSelector('[data-name="progress-container"]', { timeout: 20000 });

      displayName = await page.evaluate(() => {
        const el = document.querySelector('div.text-body-text-1.font-semibold');
        return el ? el.innerText.trim() : null;
      });

      stats = await page.evaluate(() => {
        const result = {};
        const overall = document.querySelector('button div.text-body-text-2');
        if (overall?.innerText.includes('Overall LPI')) {
          const val = overall.parentElement?.querySelector('[data-name="progress-value"]');
          if (val) result['Overall LPI'] = val.innerText.trim();
        }

        const containers = document.querySelectorAll('[data-name="progress-container"]');
        containers.forEach(container => {
          const labelElem = container.closest('button')?.querySelector('div.flex-row.items-baseline');
          const valueElem = container.querySelector('[data-name="progress-value"] div');
          if (labelElem && valueElem) {
            let label = labelElem.textContent.replace(/\(.*?\)/, '').trim();
            let value = valueElem.textContent.trim();
            if (label !== 'Overall LPI') result[label] = value;
          }
        });
        return result;
      });

      if (displayName && stats && Object.keys(stats).length > 0) {
        allResults[displayName] = stats;
        success = true;
        console.log(`📊 Stats saved for ${displayName}`);
      } else if (stats && Object.keys(stats).length > 0) {
        allResults[account.email] = stats;
        success = true;
        console.log(`📊 Stats saved for ${account.email}`);
      } else {
        console.log(`⚠ No stats found for ${account.email}`);
      }
    } catch (err) {
      console.log(`❌ Failed for ${account.email}: ${err.message}`);
    }

    await browser.close();

    if (success) {
      fs.writeFileSync('results.js', 'module.exports = ' + JSON.stringify(allResults, null, 2) + ';\n');
      console.log('✅ Updated results.js');
    }
  }

  return allResults;
}

module.exports = runLumosityStats;
