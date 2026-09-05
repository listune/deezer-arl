import { chromium, type Route } from "playwright";

export interface BrowserLoginResult {
  success: boolean;
  arl?: string;
  errorMessage?: string;
}

export class BrowserLoginService {
  /**
   * Login to Deezer using Playwright (better anti-bot than Puppeteer)
   * Uses the proven technique from working deezer-arl-generator project
   */
  public static async login(
    email: string,
    password: string,
    _cloudflareBrowserBinding?: any
  ): Promise<BrowserLoginResult> {
    let browser: any = null;

    try {
      let executablePath = process.env.BROWSER_PATH;
        
      browser = await chromium.launch({
        headless: true,
        executablePath: executablePath || undefined,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-zygote",
          "--single-process",
          "--disable-extensions",
          "--disable-background-networking",
          "--disable-default-apps",
          "--mute-audio"
        ],
      });

      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        locale: "en-US",
      });

      const page = await context.newPage();
      page.setDefaultTimeout(60000);

      // RAM optimization: Block loading of images, fonts, and media
      await page.route("**/*", (route: Route) => {
        const type = route.request().resourceType();
        if (["image", "media", "font"].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      // Mask webdriver property - critical to bypass Deezer bot detection
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      });

      // Navigate to signup locale that avoids Akamai restrictions
      console.log(`[BrowserLogin] Loading Deezer login page...`);
      await page.goto("https://account.deezer.com/en-us/login/", {
        waitUntil: "domcontentloaded",
        timeout: 40000,
      });

      await page.waitForTimeout(2500);

      // Accept cookies banner
      try {
        await page.click("button:has-text('Accept')", { timeout: 4000 });
        await page.waitForTimeout(800);
      } catch {}

      // Switch to email login if needed
      console.log(`[BrowserLogin] Searching for email login option...`);
      try {
        const emailBtn = await page.waitForSelector(
          'button:has-text("Email"), button:has-text("email"), button[data-testid="login-email-button"]',
          { state: "visible", timeout: 5000 }
        );
        if (emailBtn) {
          await emailBtn.click();
          await page.waitForTimeout(1000);
        }
      } catch (e) {}

      // Fill email
      console.log(`[BrowserLogin] Typing email...`);
      await page.waitForSelector("input#email, input[name='email'], input[type='email']", {
        state: "visible",
        timeout: 15000,
      });
      await page.fill("input#email, input[name='email'], input[type='email']", email.trim());
      await page.press("input#email, input[name='email'], input[type='email']", "Enter");
      try {
        const btn = await page.$("[data-testid='continue-button'], button[type='submit']");
        if (btn) await btn.click();
      } catch (e) {}
      await page.waitForTimeout(1500);

      // Fill password
      console.log(`[BrowserLogin] Typing password...`);
      await page.waitForSelector("input#password, input[name='password'], input[type='password']", {
        state: "visible",
        timeout: 15000,
      });
      await page.fill("input#password, input[name='password'], input[type='password']", password);
      await page.press("input#password, input[name='password'], input[type='password']", "Enter");
      try {
        const btn = await page.$("[data-testid='continue-button'], button[type='submit']");
        if (btn) await btn.click();
      } catch (e) {}
      await page.waitForTimeout(5000);

      // Wait for ARL cookie
      console.log(`[BrowserLogin] Waiting for ARL cookie...`);
      let extractedArl: string | null = null;

      for (let i = 0; i < 25; i++) {
        await page.waitForTimeout(1000);

        const cookies = await context.cookies();
        const arlCookie = cookies.find((c: any) => c.name === "arl");

        if (arlCookie && arlCookie.value && arlCookie.value.length > 50) {
          extractedArl = arlCookie.value;
          console.log(`[BrowserLogin] Success! ARL captured (${arlCookie.value.length} chars).`);
          break;
        }

        if (i % 5 === 0 && i > 0) {
          console.log(`[BrowserLogin] Polling (${i}s)... URL: ${page.url()}`);
        }

        // Check for visible error messages
        try {
          const errorEl = await page.$(".form-error, [role='alert'], .error-message, p[class*='error']");
          if (errorEl) {
            const text = await errorEl.textContent();
            if (text && text.trim().length > 3) {
              console.warn(`[BrowserLogin] Deezer login error: "${text.trim()}"`);
              return { success: false, errorMessage: text.trim() };
            }
          }
        } catch {}
      }

      if (!extractedArl) {
        console.warn(`[BrowserLogin] Timeout: No ARL cookie issued. Final URL: ${page.url()}`);
        return {
          success: false,
          errorMessage: "Invalid email or password (no ARL cookie was issued by Deezer)",
        };
      }

      return { success: true, arl: extractedArl };
    } catch (err: any) {
      console.error(`[BrowserLogin] Error:`, err?.message || err);
      return {
        success: false,
        errorMessage: err?.message || "Failed to automate browser login",
      };
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {}
      }
    }
  }
}
