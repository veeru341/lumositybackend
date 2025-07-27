const puppeteer = require('puppeteer');
const fs = require('fs');

async function runLumosityStats() {
  const accounts = JSON.parse(fs.readFileSync('accounts.json', 'utf-8'));
  let allResults = {};

  // Initialize results file
  fs.writeFileSync('results.js', 'module.exports = {};\n');

  // Load existing results if available
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
    let browser = null;
    let page = null;

    try {
      // Production browser configuration with enhanced stability
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-images', // Speed up loading
          '--disable-javascript-harmony-shipping',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ],
        timeout: 60000,
        protocolTimeout: 60000,
      });

      page = await browser.newPage();

      // Enhanced page configuration
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1366, height: 768 });
      
      // Set longer default timeout for all operations
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);

      console.log(`🌐 Processing account: ${account.email}`);
      
      // Navigate to login page with retry mechanism
      let loginAttempt = 0;
      const maxLoginAttempts = 3;
      
      while (loginAttempt < maxLoginAttempts) {
        try {
          await page.goto('https://app.lumosity.com/login', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
          });
          
          // Wait for page to be interactive
          await page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 });
          await new Promise(resolve => setTimeout(resolve, 3000));
          break;
        } catch (navError) {
          loginAttempt++;
          console.log(`⚠ Login page load attempt ${loginAttempt} failed for ${account.email}: ${navError.message}`);
          if (loginAttempt >= maxLoginAttempts) {
            throw new Error(`Failed to load login page after ${maxLoginAttempts} attempts`);
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Handle email login button with better error handling
      try {
        const emailButtons = await page.$$('button span');
        for (const btn of emailButtons) {
          try {
            const text = await page.evaluate(el => el.innerText.toLowerCase(), btn);
            if (text.includes('email')) {
              const parentButton = await btn.getProperty('parentNode');
              await parentButton.click();
              await new Promise(resolve => setTimeout(resolve, 1000));
              break;
            }
          } catch (e) {
            // Continue to next button if this one fails
            continue;
          }
        }
      } catch (e) {
        // Continue if email button handling fails
      }

      // Login process with enhanced error handling
      await page.waitForSelector('input#email', { timeout: 20000 });
      
      // Clear and type credentials
      await page.click('input#email', { clickCount: 3 });
      await page.type('#email', account.email, { delay: 50 });
      
      await page.click('input#password', { clickCount: 3 });
      await page.type('#password', account.password, { delay: 50 });

      // Submit login
      const loginButtons = await page.$$('button');
      let loginSubmitted = false;
      
      for (const btn of loginButtons) {
        try {
          const text = await page.evaluate(el => el.innerText.trim(), btn);
          if (text === 'Log In') {
            await btn.click();
            loginSubmitted = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!loginSubmitted) {
        throw new Error('Could not find or click login button');
      }

      // Wait for dashboard with better error handling
      try {
        await page.waitForSelector('[data-name="progress-container"]', { timeout: 25000 });
      } catch (e) {
        // Try alternative selectors if main one fails
        await page.waitForSelector('div.text-body-text-1.font-semibold', { timeout: 10000 });
      }

      // Wait for page to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Extract display name
      displayName = await page.evaluate(() => {
        const el = document.querySelector('div.text-body-text-1.font-semibold');
        return el ? el.innerText.trim() : null;
      });

      // Extract basic dashboard stats
      stats = await page.evaluate(() => {
        const result = {};
        try {
          const overall = document.querySelector('button div.text-body-text-2');
          if (overall?.innerText.includes('Overall LPI')) {
            const val = overall.parentElement?.querySelector('[data-name="progress-value"]');
            if (val) result['Overall LPI'] = val.innerText.trim();
          }

          const containers = document.querySelectorAll('[data-name="progress-container"]');
          containers.forEach(container => {
            try {
              const labelElem = container.closest('button')?.querySelector('div.flex-row.items-baseline');
              const valueElem = container.querySelector('[data-name="progress-value"] div');
              if (labelElem && valueElem) {
                let label = labelElem.textContent.replace(/\(.*?\)/, '').trim();
                let value = valueElem.textContent.trim();
                if (label !== 'Overall LPI') result[label] = value;
              }
            } catch (e) {
              // Skip this container if extraction fails
            }
          });
        } catch (e) {
          // Return partial results if extraction fails
        }
        return result;
      });

      if ((displayName && stats && Object.keys(stats).length > 0) || (stats && Object.keys(stats).length > 0)) {
        // Navigate to detailed stats page with enhanced error handling
        try {
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Check if stats link exists
          const statsLink = await page.$('a[href="/stats"]');
          if (statsLink) {
            // Click the stats link
            await statsLink.click();
            
            // Handle navigation more gracefully
            try {
              await page.waitForNavigation({ 
                waitUntil: 'domcontentloaded', 
                timeout: 15000 
              });
            } catch (navError) {
              // If navigation event doesn't fire, wait for URL change
              await page.waitForFunction(
                () => window.location.pathname.includes('/stats'),
                { timeout: 10000 }
              );
            }
            
            // Wait for content to load
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Verify we're on the stats page
            const currentUrl = await page.url();
            if (!currentUrl.includes('/stats')) {
              throw new Error('Failed to navigate to stats page');
            }
            
            // Extract detailed stats with enhanced error handling
            const detailedStats = await page.evaluate(() => {
              const statsData = {};
              
              try {
                // LPI Section
                const lpiSection = document.querySelector('section');
                if (lpiSection) {
                  try {
                    const overallLPI = lpiSection.querySelector('[data-name="progress-value"]');
                    if (overallLPI) {
                      statsData['Overall LPI'] = overallLPI.textContent.trim();
                    }
                    
                    const cognitiveAreas = lpiSection.querySelectorAll('button[class*="flex flex-row justify-center items-center gap-4"]');
                    cognitiveAreas.forEach(area => {
                      try {
                        const labelDiv = area.querySelector('div.flex.flex-row.items-baseline');
                        const valueDiv = area.querySelector('[data-name="progress-value"] div');
                        
                        if (labelDiv && valueDiv) {
                          let label = labelDiv.textContent.replace(/\(.*?\)/, '').trim();
                          let value = valueDiv.textContent.trim();
                          if (label && value && label !== 'Overall LPI') {
                            statsData[label] = value;
                          }
                        }
                      } catch (e) {
                        // Skip this area if extraction fails
                      }
                    });
                    
                    const textElements = Array.from(lpiSection.querySelectorAll('div'));
                    textElements.forEach(el => {
                      try {
                        if (el.textContent.trim() === 'First LPI') {
                          const valueDiv = el.parentElement?.querySelector('div.text-body-text-1');
                          if (valueDiv) statsData['First LPI'] = valueDiv.textContent.trim();
                        }
                        
                        if (el.textContent.trim() === 'Best LPI') {
                          const valueDiv = el.parentElement?.querySelector('div.text-body-text-1');
                          if (valueDiv) statsData['Best LPI'] = valueDiv.textContent.trim();
                        }
                      } catch (e) {
                        // Skip this element if extraction fails
                      }
                    });
                  } catch (e) {
                    // Continue if LPI section fails
                  }
                }
                
                // Percentile Comparisons
                try {
                  const sections = document.querySelectorAll('section');
                  let percentileSection = null;
                  
                  sections.forEach(section => {
                    const textContent = section.textContent;
                    if (textContent.includes('How I compare') || textContent.includes('Overall Percentile')) {
                      percentileSection = section;
                    }
                  });
                  
                  if (percentileSection) {
                    const overallPercentileDiv = percentileSection.querySelector('div.text-subheading-2');
                    if (overallPercentileDiv && overallPercentileDiv.textContent.includes('Overall Percentile')) {
                      const overallValue = overallPercentileDiv.parentElement?.querySelector('div.text-body-text-1.font-normal');
                      if (overallValue) {
                        statsData['Overall Percentile'] = overallValue.textContent.trim();
                      }
                    }
                    
                    const percentileItems = percentileSection.querySelectorAll('div.flex.flex-col.py-4.pr-14.border-t');
                    percentileItems.forEach((item, index) => {
                      try {
                        const labelDiv = item.querySelector('div.flex.flex-row.items-baseline.gap-1.text-body-text-3.font-normal');
                        const allValueDivs = item.querySelectorAll('div.text-body-text-3.font-normal');
                        let value = null;
                        
                        allValueDivs.forEach(div => {
                          if (div !== labelDiv && div.textContent.includes('%')) {
                            value = div.textContent.trim();
                          }
                        });
                        
                        if (labelDiv && value) {
                          let label = labelDiv.textContent.trim().replace(/\(.*?\)/, '').trim();
                          statsData[label + ' Percentile'] = value;
                        }
                      } catch (e) {
                        // Skip this percentile item if extraction fails
                      }
                    });
                  }
                } catch (e) {
                  // Continue if percentile section fails
                }
                
                // Training Streaks
                try {
                  document
                    .querySelectorAll('div.text-caption-1.text-text-subdued')
                    .forEach(labelDiv => {
                      try {
                        const label = labelDiv.textContent.trim();
                        if (label === 'Current streak' || label === 'Best streak') {
                          const valueDiv = labelDiv.previousElementSibling;
                          if (valueDiv && valueDiv.classList.contains('text-heading-3')) {
                            const streakValue = valueDiv.textContent.trim();
                            if (label === 'Current streak') {
                              statsData['Current Streak'] = streakValue;
                            } else if (label === 'Best streak') {
                              statsData['Best Streak'] = streakValue;
                            }
                          }
                        }
                      } catch (e) {
                        // Skip this streak if extraction fails
                      }
                    });
                  
                  const calendar = document.querySelector('div.flex.justify-center.text-center.w-full.max-w-\\[340px\\]');
                  if (calendar) {
                    const weeklyStatus = {};
                    calendar
                      .querySelectorAll('div.flex-1.min-w-\\[32px\\].flex.flex-col')
                      .forEach(dayCol => {
                        try {
                          const dayLabel = dayCol.querySelector('span');
                          const indicator = dayCol.querySelector('div.sc-121a1d6f-0.sc-121a1d6f-1');
                          
                          if (dayLabel && indicator) {
                            const day = dayLabel.textContent.trim();
                            const hasTraining = indicator.classList.contains('kkEduW');
                            const isToday = dayLabel.classList.contains('font-semibold');
                            
                            weeklyStatus[day] = {
                              hasTraining,
                              isToday,
                              status: hasTraining ? 'completed' : 'not_completed'
                            };
                          }
                        } catch (e) {
                          // Skip this day if extraction fails
                        }
                      });
                    
                    if (Object.keys(weeklyStatus).length > 0) {
                      statsData['Weekly Training Status'] = weeklyStatus;
                    }
                  }
                } catch (e) {
                  // Continue if training streaks section fails
                }
                
                // Game Rankings and Most Improved Games
                try {
                  const allSections = Array.from(document.querySelectorAll('section'));
                  
                  // Game Rankings
                  const gameRankingSection = allSections.find(section => 
                    section.textContent.includes('Game Rankings')
                  );
                  
                  if (gameRankingSection) {
                    const gameItems = gameRankingSection.querySelectorAll('div.pt-5.pr-6.pb-4.pl-5');
                    const topGames = [];
                    
                    gameItems.forEach((item, index) => {
                      try {
                        const gameName = item.querySelector('div.text-subheading-3');
                        const gameScore = item.querySelector('[data-name="progress-value"]');
                        const rank = item.querySelector('div.text-body-text-3.font-bold');
                        const bestBadge = item.querySelector('div.text-micro-text-2.uppercase');
                        
                        if (gameName && gameScore && rank) {
                          topGames.push({
                            rank: rank.textContent.trim(),
                            name: gameName.textContent.trim(),
                            score: gameScore.textContent.trim(),
                            isBest: bestBadge && bestBadge.textContent.includes('Best')
                          });
                        }
                      } catch (e) {
                        // Skip this game if extraction fails
                      }
                    });
                    
                    if (topGames.length > 0) {
                      statsData['Top Games'] = topGames;
                    }
                  }
                  
                  // Most Improved Games
                  const improvedSection = allSections.find(section => 
                    section.textContent.includes('Most Improved Games')
                  );
                  
                  if (improvedSection) {
                    const improvedItems = improvedSection.querySelectorAll('div.pt-5.pr-6.pb-4.pl-5');
                    const improvedGames = [];
                    
                    improvedItems.forEach(item => {
                      try {
                        const gameName = item.querySelector('div.text-subheading-3');
                        const improvement = item.querySelector('div.text-caption-2.text-text-subdued');
                        const rank = item.querySelector('div.text-body-text-3.font-bold');
                        const bestBadge = item.querySelector('div.text-micro-text-2.uppercase');
                        
                        if (gameName && improvement && rank) {
                          improvedGames.push({
                            rank: rank.textContent.trim(),
                            name: gameName.textContent.trim(),
                            improvement: improvement.textContent.trim(),
                            isBest: bestBadge && bestBadge.textContent.includes('Best')
                          });
                        }
                      } catch (e) {
                        // Skip this game if extraction fails
                      }
                    });
                    
                    if (improvedGames.length > 0) {
                      statsData['Most Improved Games'] = improvedGames;
                    }
                  }
                } catch (e) {
                  // Continue if games sections fail
                }
                
              } catch (e) {
                // Return partial results if overall extraction fails
              }
              
              return statsData;
            });
            
            // Merge detailed stats with basic stats
            Object.assign(stats, detailedStats);
            
          } else {
            console.log(`⚠ Stats link not found for ${account.email}`);
          }
          
        } catch (err) {
          console.log(`⚠ Could not load detailed stats for ${account.email}: ${err.message}`);
          // Continue with basic stats only
        }
        
        // Store results
        const accountKey = displayName || account.email;
        allResults[accountKey] = stats;
        success = true;
        console.log(`✅ Stats processed for ${accountKey}`);
        
      } else {
        console.log(`⚠ No stats found for ${account.email}`);
      }
      
    } catch (err) {
      console.log(`❌ Error processing ${account.email}: ${err.message}`);
    } finally {
      // Ensure browser is always closed
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          // Ignore close errors
        }
      }
    }

    // Save results after each account
    if (success) {
      fs.writeFileSync('results.js', 'module.exports = ' + JSON.stringify(allResults, null, 2) + ';\n');
    }

    // Add delay between accounts to avoid rate limiting
    if (accounts.indexOf(account) < accounts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log(`🎉 Processing complete. Results saved for ${Object.keys(allResults).length} accounts.`);
  return allResults;
}

module.exports = runLumosityStats;