const logger = require("@/utils/logging").getLogger("setup.js");
import "@mdi/font/css/materialdesignicons.css";
import { LocalStorage } from "ttl-localstorage";
var mobile = require("is-mobile");

import {
  doesParameterExist,
  getParameterByName,
  fixSolutions,
  createSharableLink
} from "@/utils/utils";
import { Ripple } from "vuetify/lib/directives";
import superagent from "superagent";
import PromisedLocation from "promised-location";
import COLOR_NAMES from "@/constants/color-names";
import Vue from "vue";
import "@/utils/vee-validate";

import "vue-loaders/dist/vue-loaders.css";
import "vue2-animate/dist/vue2-animate.min.css";

import Vuetify from "vuetify/lib/framework";
Vue.use(Vuetify, {
  directives: {
    Ripple
  }
});

import { ASR_CORRECTIONS } from "@/constants/asr-corrections"; // fix ASR issues before they get to Teneo
import { LiveChat } from "@/utils/live-chat";
import { STORAGE_KEY } from "@/constants/solution-config-default";

let logrocketPlugin = null;
let logRocket = null;
let sentry = null;

// start LogRocket Setup
if (window.leopardConfig.isProduction && window.leopardConfig.logging.logRocket) {
  import("logrocket")
    .then(({ default: LogRocket }) => {
      logRocket = LogRocket;
      logger.debug(`Setting up LogRocket 🚀`);
      LogRocket.init(window.leopardConfig.logging.logRocket);
      import("logrocket-vuex").then(({ default: createPlugin }) => {
        logrocketPlugin = createPlugin(LogRocket);
        logger.debug(`LogRocket 🚀 setup complete`);
      });
    })
    .catch(err => {
      logger.error(`Failed to dynamically import LogRocket 🚀`, err);
    });
}
// End LogRocket Setup

// start sentry
if (window.window.leopardConfig.isProduction && window.window.leopardConfig.logging.sentryDsn) {
  Promise.all([import("@sentry/browser"), import("@sentry/integrations")]).then(
    ([Sentry, Integrations]) => {
      Sentry.init({
        dsn: window.leopardConfig.logging.sentryDsn,
        integrations: [new Integrations.Vue({ Vue, attachProps: true })],
        logErrors: true
      });
      sentry = Sentry;
    }
  );
}
// end sentry

export default class Setup {
  constructor() {
    this.TENEO_CHAT_HISTORY = "teneo-chat-history";
    this.TENEO_LAST_INTERACTION_DATE = "teneo-last-interaction";
    this.TENEO_CHAT_DARK_THEME = "darkTheme";
    this.logrocketPlugin = logrocketPlugin;
    this.ASR_CORRECTIONS_MERGED;
    this.liveChat;
    this.CHAT_TITLE = "Configure Me";
    this.IS_AGENT_ASSIST = doesParameterExist("plugin_id");
    this.EMBED = doesParameterExist("embed");
    this.sheetId = getParameterByName("sheetId");
    this.SHOULD_TTS_ENABLED_AT_STARTUP = false;
    this.ENABLE_LIVE_CHAT = false;
    this.FLOAT = false;
    this.THEME = {
      primary: "#3277D5",
      secondary: "#E78600",
      accent: "#4CAF50",
      error: "#FF5252",
      info: "#2196F3",
      success: "#4CAF50",
      warning: "#FFC107"
    };
    this.IFRAME_URL = "";
    this.KNOWLEDGE_DATA = [];
    this.LOCALE = "en";
    this.REQUEST_PARAMETERS = "";
    this.RESPONSE_ICON = "";
    this.SEND_CTX_PARAMS = "login";
    this.TENEO_URL = "";
    this.USE_SESSION_STORAGE = !this.EMBED;
    this.USER_ICON = "";
    this.activeSolution = null;
    this.chatConfig = null;
    // Get the dark theme setting from local storage
    // let darkThemeSetting = localStorage.getItem(STORAGE_KEY + "darkTheme");

    localStorage.setItem(STORAGE_KEY + "darkTheme", "false");
  }

  init() {
    return new Promise((resolve, reject) => {
      this.getSolutionConfig()
        .then(async config => {
          this.chatConfig = fixSolutions(config);

          if (!this.EMBED) {
            this.addIframeHtml();
          }

          logger.info(`Active Solution Config: `, this.chatConfig);

          if (this.chatConfig && this.chatConfig.activeSolution) {
            logger.debug(`Active Solution: ${this.chatConfig.activeSolution}`);
            let deepLink = getParameterByName("dl"); // look for deep link
            if (!deepLink) {
              this.setupNoDeepLink();
            } else {
              // allow for deep linking to a specific solution ?dl=<deepLink>
              this.setupDeepLink(deepLink);
            }
            this.setupTivaSheetId();
            this.ASR_CORRECTIONS_MERGED = this.getMergedAsrCorrections(ASR_CORRECTIONS);
            logger.debug("Merged ASR Corrections");
            this.CHAT_TITLE = this.activeSolution.chatTitle;
            this.IFRAME_URL = this.activeSolution.iframeUrl;
            this.KNOWLEDGE_DATA = this.activeSolution.knowledgeData;
            this.LOCALE = this.activeSolution.locale;
            this.FLOAT = this.activeSolution.float;
            this.RESPONSE_ICON = this.activeSolution.responseIcon;

            await this.determineIfTtsShouldBeEnabledAtStartup();

            // this.DIALOG = this.retrievePastDialog();
            this.SEND_CTX_PARAMS = this.activeSolution.sendContextParams
              ? this.activeSolution.sendContextParams
              : "login";
            this.TENEO_URL = this.activeSolution.url;
            this.USER_ICON = this.activeSolution.userIcon;

            let theme = this.activeSolution.theme;
            // convert color names to their #hex equivalent
            for (const key in theme) {
              if (theme[key].charAt(0) !== "#") theme[key] = COLOR_NAMES[theme[key]];
            }
            this.THEME = theme;

            this.ENABLE_LIVE_CHAT =
              this.activeSolution.enableLiveChat && !doesParameterExist("plugin_id");
            this.UNIQUE_KEY =
              this.activeSolution.deepLink +
              (window.location.href.indexOf("mobile=true") > -1 ? "_mobile" : "");
            document.title = this.activeSolution.name;

            this.setupContextParams();
          }

          // update the IFRAME URL
          this.setupIframeInNonEmbedMode();
          logger.debug("About to initialize Vuetify");
          let vuetify = this.setupVuetifyConfig();
          this.setupThirdPartyLogging();
          this.setupGeoCapture(resolve, vuetify);
          resolve(vuetify);
        })
        .catch(error => {
          console.error("Can't get Vuetify to work", error);
          reject(error);
        });
    });
  }

  determineIfTtsShouldBeEnabledAtStartup() {
    return new Promise(resolve => {
      let that = this;
      let enableAsrTtsOnOpen = this.activeSolution.enableAsrTtsOnOpen;
      if (enableAsrTtsOnOpen && navigator && navigator.mediaDevices && !mobile()) {
        var isChrome =
          /Chrome/.test(navigator.userAgent) &&
          !/ OPR/.test(navigator.userAgent) &&
          /Google Inc/.test(navigator.vendor);
        if (isChrome) {
          navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then(function () {
              that.SHOULD_TTS_ENABLED_AT_STARTUP = true;
              logger.info("Enabling TTS at startup");
              resolve();
            })
            .catch(function (err) {
              logger.debug("ASR input is not allowed", err);
              resolve();
            });
        }
      } else {
        resolve();
      }
    });
  }

  setupIframeInNonEmbedMode() {
    if (!this.EMBED && document.getElementById("site-frame")) {
      document.getElementById("site-frame").src = this.IFRAME_URL;
      logger.debug("Updated IFRAME url", this.IFRAME_URL);
    }
  }

  setupContextParams() {
    let self = this;
    // find active CTX parameters and build the parameters part of the URL
    this.activeSolution.contextParams.forEach(contextParam => {
      if (contextParam) {
        contextParam.values.forEach(value => {
          if (value.active) {
            self.REQUEST_PARAMETERS =
              self.REQUEST_PARAMETERS +
              "&" +
              contextParam.name +
              "=" +
              encodeURIComponent(value.text);
          }
        });
      }
    });
  }

  setupNoDeepLink() {
    logger.debug(`No deep link found in the current url - load default solution`);
    this.activeSolution = this.chatConfig.activeSolution;
    const matchingSolutions = this.chatConfig.solutions.filter(
      solution => solution.id === this.activeSolution
    );
    if (matchingSolutions.length > 0) {
      this.activeSolution = matchingSolutions[0];
    } else {
      this.activeSolution = this.chatConfig.solutions[0];
    }
  }

  setupDeepLink(deepLink) {
    const matchingSolutions = this.chatConfig.solutions.filter(
      solution => solution.deepLink === deepLink
    );
    if (matchingSolutions.length > 0) {
      this.activeSolution = matchingSolutions[0];
    } else {
      // fall back to default
      this.activeSolution = this.chatConfig.activeSolution;
      const matchingSolutions = this.chatConfig.solutions.filter(
        solution => solution.id === this.activeSolution
      );
      if (matchingSolutions.length > 0) {
        this.activeSolution = matchingSolutions[0];
      } else {
        this.activeSolution = this.chatConfig.solutions[0];
      }
    }
  }

  setupTivaSheetId() {
    if (this.sheetId) {
      let targetContext = this.activeSolution.contextParams.find(
        element => element.name === "sheetId"
      );
      if (targetContext) {
        targetContext.values[0].text = this.sheetId;
      } else {
        this.activeSolution.contextParams.push({
          name: "sheetId",
          values: [
            {
              text: this.sheetId,
              active: true
            }
          ]
        });
      }
    }
  }

  setupVuetifyConfig() {
    return new Vuetify({
      breakpoint: {
        thresholds: {
          xs: 0,
          sm: 300,
          md: 480,
          lg: 1000,
          xl: 1300
        }
      },
      theme: {
        dark: false,
        options: {
          customProperties: false
        },
        themes: {
          light: this.THEME,
          dark: {
            primary: "#161616",
            secondary: "#0F6695",
            accent: "#00FF00",
            error: "#FF4B4B",
            info: "#1E92D0",
            success: "#335f13",
            warning: "#FDFF00",
            anchor: "#67BAD7",
            sendButton: "#FFFFFF",
            focusButton: "#CEFF00",
            textButton: "#FFFFFF"
          }
        }
      },
      directives: {
        Ripple
      }
    });
  }

  obtainLocation(resolve, vuetify) {
    let browserIp;
    let ipUrl = window.leopardConfig.ipUrl ? window.leopardConfig.ipUrl : "https://ipapi.co/ip/";
    logger.debug(`ipUrl`, ipUrl);
    superagent
      .get(ipUrl)
      .timeout(3000)
      .then(res => {
        browserIp = res.text;
        let geoUrl = window.leopardConfig.geoUrl
          ? window.leopardConfig.geoUrl
          : `https://cors.joles.xyz/http://www.geoplugin.net/json.gp?ip=${res.text}`;
        logger.debug(`geoUrl`, geoUrl);
        return superagent.get(geoUrl).timeout(3000).accept("application/json");
      })
      .then(res => {
        const loc = JSON.parse(res.text);
        logger.debug(`📍 Obtained New Location Information`, loc);
        if (window.leopardConfig.geoUrl) {
          this.LOCATION = {
            ip: browserIp,
            city: loc.city,
            continentCode: loc.continentCode,
            continentName: loc.continentName,
            countryCode: loc.countryCode,
            countryName: loc.countryName,
            currencySymbol: loc.currencySymbol,
            currencyCode: loc.currencyCode,
            latitude: loc.latitude,
            longitude: loc.longitude,
            regionCode: loc.regionCode,
            regionName: loc.regionName
          };
        } else {
          this.LOCATION = {
            ip: browserIp,
            city: loc.geoplugin_city,
            continentCode: loc.geoplugin_continentCode,
            continentName: loc.geoplugin_continentName,
            countryCode: loc.geoplugin_countryCode,
            countryName: loc.geoplugin_countryName,
            currencySymbol: loc.geoplugin_currencySymbol,
            currencyCode: loc.geoplugin_currencyCode,
            latitude: loc.geoplugin_latitude,
            longitude: loc.geoplugin_longitude,
            regionCode: loc.geoplugin_regionCode,
            regionName: loc.geoplugin_regionName
          };
        }

        LocalStorage.put(STORAGE_KEY + "loc", this.LOCATION); // cache so we don't do this too often
        resolve(vuetify);
      })
      .catch(err => {
        this.LOCATION = "";
        logger.error(`📍 Unable to obtain location info`, err);
        resolve(vuetify);
      });
  }

  getSolutionConfig() {
    logger.debug("Begin looking for Solution Config ");
    return new Promise((resolve, reject) => {
      // Reload config for each load. Maybe there a new deployment change that you want to
      if (window.leopardConfig.loadFreshConfigForNewSessions) {
        // localStorage.removeItem(STORAGE_KEY + "config");
        logger.debug("Loading fresh solution config");
      } else {
        logger.debug("Looking for Solution Config in localStorage first");
        let configInLocalStorage = localStorage.getItem(STORAGE_KEY + "config");
        if (configInLocalStorage && configInLocalStorage !== "null") {
          this.chatConfig = JSON.parse(configInLocalStorage);
          if (this.chatConfig) {
            logger.debug("Found config in localstorage");
          }
        }
      }

      if (!this.chatConfig || (this.chatConfig && this.chatConfig.solutions.length === 0)) {
        this._loadDefaultConfig()
          .then(defaultConfig => {
            this.chatConfig = defaultConfig;
            resolve(this.chatConfig);
          })
          .catch(message => reject(message));
      } else {
        logger.debug(
          "Found Solution Config | using existing solutions in local storage | Presales Mode"
        );
        resolve(this.chatConfig);
      }
    });
  }

  _loadDefaultConfig() {
    return new Promise((resolve, reject) => {
      if (!window.leopardConfig.mustGetStaticDefaultConfig) {
        logger.debug(
          "Found and loaded build's solution environment config",
          window.leopardConfig.solutionConfig.buildConfig
        );
        resolve(window.leopardConfig.solutionConfig.buildConfig);
      } else {
        // look for default config on the server
        const defaultConfigUrl = `${location.protocol}//${location.host}${location.pathname}/../static/config.json`;
        superagent
          .get(defaultConfigUrl)
          .accept("application/json")
          .then(res => {
            logger.debug("Found and loaded Solution Config from /static/config.json");
            let defaultConfig = res.body;
            if (defaultConfig) {
              localStorage.setItem(STORAGE_KEY + "config", JSON.stringify(defaultConfig));
              resolve(defaultConfig);
            } else {
              reject("Could not load config.json from /static/config.json");
            }
          })
          .catch(function (error) {
            reject("Could not load config.json from /static/config.json: " + error.message);
          });
      }
    });
  }

  setupLiveChat(store) {
    this.liveChat = new LiveChat(
      store,
      !this.USE_SESSION_STORAGE,
      STORAGE_KEY,
      this.TENEO_CHAT_HISTORY
    );
  }

  getMergedAsrCorrections(leopardDefaultCorrections) {
    let finalCorrections = leopardDefaultCorrections;
    if (this.activeSolution && "asrCorrections" in this.activeSolution) {
      let solutionReplacements = [];
      let lines = this.activeSolution.asrCorrections.split(/\r?\n/);
      lines.forEach(replacement => {
        if (replacement.trim() !== "") {
          let thisThatArray = replacement.split(/\|/);
          if (thisThatArray.length === 2) {
            thisThatArray[0] = thisThatArray[0].trim();
            thisThatArray[1] = thisThatArray[1].trim();
            solutionReplacements.push(thisThatArray);
          }
        }
      });
      finalCorrections = leopardDefaultCorrections.concat(solutionReplacements);
    }
    return finalCorrections;
  }

  getLocator() {
    const LOCATION_OPTIONS = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    };
    let locator = new PromisedLocation(LOCATION_OPTIONS);
    return locator;
  }

  isPusherEnabled() {
    return false;
  }

  addIframeHtml() {
    let iframeHtml = `<iframe id="site-frame" sandbox="allow-same-origin allow-scripts allow-popups allow-forms" src="" frameborder="0" title="Demonstration Page"></iframe>`;
    document.body.innerHTML += iframeHtml;
  }

  getFunctionHTMLTemplate(f) {
    return f
      .toString()
      .replace(/^[^/]+\/\*!?/, "")
      .replace(/\*\/[^/]+$/, "");
  }

  setupGeoCapture(resolve, vuetify) {
    if (window.leopardConfig.mustSendLocationAtLogin) {
      LocalStorage.keyExists(STORAGE_KEY + "loc").then(exists => {
        if (exists) {
          LocalStorage.get(STORAGE_KEY + "loc").then(data => {
            superagent
              .get(window.leopardConfig.ipUrl ? window.leopardConfig.ipUrl : "https://ipapi.co/ip/")
              .timeout(3000)
              .then(res => {
                if (res.text === data.ip) {
                  logger.debug(`📍 Found Location Info in LocalStorage. IP hasn't changed`, data);
                  this.LOCATION = data;
                  resolve(vuetify);
                } else {
                  this.obtainLocation(resolve, vuetify);
                }
              });
          });
        } else {
          this.obtainLocation(resolve, vuetify);
        }
      });
    }
  }

  setupThirdPartyLogging() {
    setTimeout(() => {
      if (logRocket && sentry) {
        logRocket.getSessionURL(sessionURL => {
          sentry.configureScope(scope => {
            scope.setExtra("teneoSolutionURL", createSharableLink(this.activeSolution));
            scope.setExtra("sessionURL", sessionURL);
          });
        });
      }
    }, 2000);
  }

  setupPusher() {
    // if (this.isPusherEnabled()) {
    //   Vue.use(require("vue-pusher"), {
    //     api_key: window.leopardConfig.pusherKey,
    //     options: {
    //       cluster: "us2",
    //       encrypted: true,
    //       forceTLS: true
    //     }
    //   });
    // }
  }
}
