import { DeezerLoginResult, DeezerValidationResult } from "../types/index.js";

export class DeezerAuthService {
  private static USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  public static async validateArl(arl: string): Promise<DeezerValidationResult> {
    const cleanArl = arl.trim();
    if (!cleanArl) {
      return {
        valid: false,
        status: "EXPIRED",
        errorMessage: "ARL token is empty",
      };
    }

    try {
      const res = await fetch(
        "https://www.deezer.com/ajax/gw-light.php?method=deezer.getUserData&api_version=1.0&api_token=",
        {
          method: "GET",
          headers: {
            "User-Agent": this.USER_AGENT,
            "Cookie": `arl=${cleanArl}`,
            "Accept": "application/json",
          },
        }
      );

      if (!res.ok) {
        return {
          valid: false,
          status: "BLOCKED",
          errorMessage: `Deezer server returned HTTP ${res.status}`,
        };
      }

      const data = (await res.json()) as any;
      const user = data?.results?.USER;
      const userId = String(user?.USER_ID || "");

      if (!userId || userId === "0" || userId === "null") {
        return {
          valid: false,
          status: "EXPIRED",
          errorMessage: "ARL token has expired or is invalid",
        };
      }

      const isBlocked = user?.IS_SUSPENDED === true || user?.IS_BLOCKED === true;
      if (isBlocked) {
        return {
          valid: false,
          status: "BLOCKED",
          userId,
          userName: user?.BLOG_NAME || "Deezer User",
          errorMessage: "Account has been suspended or blocked by Deezer",
        };
      }

      const userName = user?.BLOG_NAME || user?.USER_NAME || "Deezer User";
      const country = user?.COUNTRY || "US";
      const avatarHash = user?.USER_PICTURE;
      const avatarUrl = avatarHash
        ? `https://e-cdns-images.dzcdn.net/images/user/${avatarHash}/250x250-000000-80-0-0.jpg`
        : null;

      const offerName = data?.results?.OFFER_NAME || (data?.results?.USER?.OPTIONS?.web_sound_quality === "lossless" ? "HiFi" : "FREE");
      const tier = offerName.toUpperCase().includes("PREMIUM") || offerName.toUpperCase().includes("HIFI") ? "PREMIUM" : "FREE";

      return {
        valid: true,
        status: "ACTIVE",
        userId,
        userName,
        avatarUrl,
        country,
        tier,
      };
    } catch (err: any) {
      return {
        valid: false,
        status: "EXPIRED",
        errorMessage: err?.message || "Failed to connect to Deezer gateway",
      };
    }
  }


  public static async login(
    email: string,
    password: string,
    cloudflareBrowserBinding?: any
  ): Promise<DeezerLoginResult> {
    try {
      let extractedArl: string | null = null;
      let browserErrorMessage: string | null = null;

      try {
        const browserModule = await import("./BrowserLoginService.js");
        const service =
          browserModule?.BrowserLoginService ||
          (browserModule as any)?.default?.BrowserLoginService ||
          (browserModule as any)?.default;

        if (service && typeof service.login === "function") {
          const browserRes = await service.login(email, password, cloudflareBrowserBinding);
          if (browserRes?.success && browserRes?.arl) {
            extractedArl = browserRes.arl;
          } else if (browserRes?.errorMessage) {
            browserErrorMessage = browserRes.errorMessage;
          }
        }
      } catch (err: any) {

      }

      if (!extractedArl) {
        try {
          const initRes = await fetch(
            "https://www.deezer.com/ajax/gw-light.php?method=deezer.getUserData&api_version=1.0&api_token=",
            {
              method: "GET",
              headers: {
                "User-Agent": this.USER_AGENT,
                "Accept": "application/json",
                "Referer": "https://www.deezer.com/login",
              },
            }
          );
          const initData = (await initRes.json()) as any;
          const checkForm = initData?.results?.checkForm || "";
          const initSetCookies = initRes.headers.get("set-cookie") || "";
          const sidMatch = /sid=([^;]+)/i.exec(initSetCookies);
          const sid = sidMatch ? sidMatch[1] : "";

          const actionRes = await fetch("https://www.deezer.com/ajax/action.php", {
            method: "POST",
            headers: {
              "User-Agent": this.USER_AGENT,
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "Cookie": sid ? `sid=${sid}` : "",
              "Referer": "https://www.deezer.com/login",
              "Origin": "https://www.deezer.com",
              "X-Requested-With": "XMLHttpRequest",
              "Accept": "*/*",
            },
            body: new URLSearchParams({
              type: "login",
              mail: email.trim(),
              password: password,
              checkForm: checkForm,
              checkFormLogin: checkForm,
            }).toString(),
          });

          const actionSetCookies = actionRes.headers.get("set-cookie") || "";
          extractedArl =
            (/arl=([a-f0-9]{192})/i.exec(actionSetCookies) || /arl=([^;]+)/i.exec(actionSetCookies))?.[1] ||
            null;
        } catch {}
      }

      if (!extractedArl) {
        return {
          success: false,
          status: "INVALID_CREDENTIALS",
          errorMessage:
            browserErrorMessage ||
            "Browser auto-login is not supported on Cloudflare Free. Please paste your ARL token directly.",
        };
      }

      const validation = await this.validateArl(extractedArl);
      if (!validation.valid) {
        return {
          success: false,
          status: validation.status,
          errorMessage: validation.errorMessage || "Extracted ARL failed validation",
        };
      }

      return {
        success: true,
        arl: extractedArl,
        userId: validation.userId,
        userName: validation.userName,
        avatarUrl: validation.avatarUrl,
        country: validation.country,
        tier: validation.tier,
        status: "ACTIVE",
      };
    } catch (err: any) {
      return {
        success: false,
        status: "EXPIRED",
        errorMessage: err?.message || "Login request encountered a network error",
      };
    }
  }
}
