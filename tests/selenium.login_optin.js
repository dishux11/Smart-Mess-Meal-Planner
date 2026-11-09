'use strict';

/**
 * Selenium end-to-end script (M4): logs in as a student and opts into a meal.
 *
 * Prerequisites:
 *   1. Start the app in one terminal:  npm start
 *   2. Have Chrome + matching chromedriver available on PATH.
 *   3. Run:  npm run selenium   (or: node tests/selenium.login_optin.js)
 *
 * The script is written to be CI-friendly: it honours the HEADLESS env var and
 * exits with a non-zero code if any assertion fails.
 */

const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const assert = require('assert');

const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function run() {
  const options = new chrome.Options();
  if (process.env.HEADLESS !== 'false') {
    options.addArguments('--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900');
  }
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

  try {
    // 1. Open the app.
    await driver.get(BASE);
    await driver.wait(until.elementLocated(By.id('loginBtn')), 10000);

    // 2. Log in as a student.
    await driver.findElement(By.id('email')).sendKeys('asha@campus.edu');
    await driver.findElement(By.id('password')).sendKeys('student123');
    await driver.findElement(By.id('loginBtn')).click();

    // 3. Student dashboard should appear.
    await driver.wait(until.elementLocated(By.id('studentMeals')), 10000);
    const meals = await driver.wait(
      until.elementsLocated(By.css('#studentMeals .meal')),
      10000
    );
    assert(meals.length > 0, 'Expected at least one meal card for the student');

    // 4. Opt into the first open meal (click "Eating").
    const firstCard = meals[0];
    const eatBtn = await firstCard.findElement(By.css('button.eat'));
    await eatBtn.click();

    // 5. Verify the "eating" badge now shows on a card.
    await driver.wait(async () => {
      const badges = await driver.findElements(By.css('#studentMeals .badge.eating'));
      return badges.length > 0;
    }, 10000, 'Expected an "eating" badge after opting in');

    console.log('PASS: student logged in and opted into a meal successfully.');
    process.exitCode = 0;
  } catch (err) {
    console.error('FAIL:', err.message);
    process.exitCode = 1;
  } finally {
    await driver.quit();
  }
}

run();
