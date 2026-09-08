import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text());
});
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

await page.goto('http://localhost:5173');
await page.evaluate(() => {
  localStorage.setItem('fourfold.auth.session', JSON.stringify({ email: 'test@example.com', token: 'fake-token' }));
});
await page.reload();
await page.waitForSelector('text=Good ', { timeout: 15000 });
await page.screenshot({ path: '/private/tmp/claude-501/-Users-jax-Dev-fourfold/05128f6d-a9f0-4234-af86-545357493a89/scratchpad/01-home.png' });

// Click New Task button
await page.click('button:has-text("New Task")');
await page.waitForSelector('text=New task');
await page.screenshot({ path: '/private/tmp/claude-501/-Users-jax-Dev-fourfold/05128f6d-a9f0-4234-af86-545357493a89/scratchpad/02-dialog-open.png' });

// Type in title with @ mention
const titleInput = page.locator('input[placeholder*="Calculus"]');
await titleInput.fill('Read chapter 4 @');
await page.waitForTimeout(300);
await page.screenshot({ path: '/private/tmp/claude-501/-Users-jax-Dev-fourfold/05128f6d-a9f0-4234-af86-545357493a89/scratchpad/03-mention-at.png' });

const mentionMenu = await page.locator('.mention-menu').count();
console.log('Mention menu visible after @:', mentionMenu > 0);

if (mentionMenu > 0) {
  await page.click('.mention-opt >> nth=0');
}
await page.waitForTimeout(200);
await page.screenshot({ path: '/private/tmp/claude-501/-Users-jax-Dev-fourfold/05128f6d-a9f0-4234-af86-545357493a89/scratchpad/04-after-pick-class.png' });

// Set due date
await page.fill('input[type="date"]', '2026-09-20');

// Check priority select default and change
const priorityValue = await page.locator('select').inputValue();
console.log('Priority default (should be q2 from New Task button):', priorityValue);

// Save
await page.click('button:has-text("Save")');
await page.waitForTimeout(500);
await page.screenshot({ path: '/private/tmp/claude-501/-Users-jax-Dev-fourfold/05128f6d-a9f0-4234-af86-545357493a89/scratchpad/05-after-save.png' });

const bodyText = await page.textContent('body');
console.log('Task chip visible on home:', bodyText.includes('Read chapter 4'));

// Now test clicking a quadrant box to prefill priority
await page.click('.quad-clickable >> nth=0');
await page.waitForSelector('text=New task');
const priorityValue2 = await page.locator('select').inputValue();
console.log('Priority after clicking quadrant 0 (should be q1):', priorityValue2);
await page.screenshot({ path: '/private/tmp/claude-501/-Users-jax-Dev-fourfold/05128f6d-a9f0-4234-af86-545357493a89/scratchpad/06-quad-click.png' });

await browser.close();
console.log('DONE');
