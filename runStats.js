const puppeteer = require('puppeteer');

async function runLumosityStats() {
  const accounts = require('./accounts.json');
  const allResults = {};

  for (const account of accounts) {
    let success = false;
    let displayName = null;
    let stats = null;

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    // 🛑 Block unnecessary resources (images, fonts, CSS)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'stylesheet', 'font'].includes(type)) req.abort();
      else req.continue();
    });

    try {
      console.log(`🌐 Logging in as: ${account.email}`);
      await page.goto('https://app.lumosity.com/login', { waitUntil: 'domcontentloaded' });

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
        console.log('⚠️ Email login button not found or already open');
      }

      await page.waitForSelector('#email', { timeout: 10000 });
      await page.type('#email', account.email, { delay: 20 });
      await page.type('#password', account.password, { delay: 20 });

      // Submit login
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.innerText.trim(), btn);
        if (text === 'Log In') {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            btn.click()
          ]);
          console.log('🔓 Submitted login');
          break;
        }
      }

      // Wait for stats container
      await page.waitForSelector('[data-name="progress-container"]', { timeout: 15000 });

      // Get display name
      displayName = await page.evaluate(() => {
        const el = document.querySelector('div.text-body-text-1.font-semibold');
        return el ? el.innerText.trim() : null;
      });

      // Get stats
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
        console.log(`✅ Stats saved for ${displayName}`);
      } else if (stats && Object.keys(stats).length > 0) {
        allResults[account.email] = stats;
        success = true;
        console.log(`✅ Stats saved for ${account.email}`);
      } else {
        console.log(`❌ No stats found for ${account.email}`);
      }

    } catch (err) {
      console.log(`❌ Failed for ${account.email}: ${err.message}`);
    }

    await browser.close();
  }

  return allResults;
}

module.exports = runLumosityStats;
