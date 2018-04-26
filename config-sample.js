// Define Config Object
var config = {};

// Define Config Sub-Objects
config.app = {};
config.twitch = {};

// Define App Data
config.app.port = 8080;
config.app.base = "http://localhost:" + config.app.port;
config.app.db = "mongodb://127.0.0.1:27017/twitchSubredditCharityEffort"; // MongoDB Connection String
config.app.secret = "";
config.app.mods = ["73799378", "21427184", "113254783", "61132443", "64889356", "67469550", "58839314", "28920595"];
config.app.year = "2018";

// Define Twitch Authentication Data
config.twitch.auth = {};
config.twitch.auth.id = ""; // Twitch Client ID
config.twitch.auth.secret = ""; // Twitch Client Secret
config.twitch.auth.redirect = config.app.base + "/auth/login/";

// Define Twitch Community Data
config.twitch.community = ""; // Twitch Community ID

// Export Config
module.exports = config;