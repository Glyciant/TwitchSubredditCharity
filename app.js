// Modules
var express = require("express"),
    config = require("./config"),
    bodyParser = require("body-parser"),
    app = express(),
    session = require("express-session"),
    cookieParser = require("cookie-parser"),
    expressMongoDB = require('express-mongo-db'),
    restler = require("restler"),
    cron = require('node-cron'),
    swig = require("swig");

// Express Set Up
app.engine("html", swig.renderFile);
app.set("view engine", "html");
app.set("views", __dirname + "\\views");
app.use(express.static(__dirname + "\\static"));
app.use(expressMongoDB(config.app.db));
app.use(cookieParser());
app.use(session({
    secret: config.app.secret,
    resave: false,
    saveUninitialized: false
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.set("view cache", false);
require('swig-filters')(swig);
swig.setDefaults({
    cache: false
});

var db;

// Handle Session Variables
app.get("*", function(req, res, next) {
    db = req.db;
    if (req.session.loggedin) {
        res.locals.loggedin = req.session.loggedin;
    }
    res.locals.creating = req.session.creating;
    next();
});

// Handle Index Route
app.get("/", function(req, res) {
    // Check User is Logged In
    if (req.session.loggedin) {
        res.redirect("secure");
    }
    else {
        res.status(200).render("index");
    }
});

// Handle Secure Route
app.get("/secure", function(req, res) {
    // Check User is Logged In
    if (req.session.loggedin) {
        req.db.collection(config.app.year).find(function(err, result) {
            result.toArray().then(function(resp) {
                // Handle Connection Errors
                if (err) {
                    res.status(503).render("error", { code: "503", message: "An unexpected error occurred." });
                }
                else {
                    res.status(200).render("secure", { data: resp });
                }
            });
        });
    }
    else {
        res.status(401).render("error", { code: "401", message: "You do not have permission to access this page." });
    }
});

// Handle Redirect Route
app.get("/auth/redirect", function(req, res, next) {
    // Define Twitch Auth Data
    var id = config.twitch.auth.id,
        redirect = config.twitch.auth.redirect,
        scopes = "user_read",
        state = Math.floor(Math.random() * 9999999999999999999999999).toString(36).substring(0, 15);

    // Set State String
    req.session.twitch_state = state;

    // Redirect to Twitch Auth
    res.redirect("https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=" + id + "&state=" + state + "&redirect_uri=" + redirect + "&scope=" + scopes);
});

// Handle Login Route
app.get("/auth/login", function(req, res) {
    // Check for Access Denied Error
    if (req.query.error != "access_denied") {
        // Check State String is Correct
        if (req.query.state == req.session.twitch_state) {
            // Get OAuth Token
            restler.post("https://id.twitch.tv/oauth2/token", {
                data: {
                    client_id: config.twitch.auth.id,
                    client_secret: config.twitch.auth.secret,
                    grant_type: "authorization_code",
                    redirect_uri: config.twitch.auth.redirect,
                    code: req.query.code
                }
            }).on("complete", function(auth) {
                restler.get("https://api.twitch.tv/helix/users", {
                    headers: {
                        "User-Agent": "Twitch Subreddit Charity Effort",
                        "Authorization": "Bearer " + auth.access_token,
                        "Client-ID": config.twitch.auth.id
                    }
                }).on("complete", function(resp) {
                    // Check for API Failure
                    if (resp && resp.data) {
                        // Get User from Payload
                        var user = resp.data[0];

                        // Check User is a Moderator of /r/Twitch
                        if (config.app.mods.indexOf(user.id) > -1) {
                            req.session.loggedin = {
                                id: user.id,
                                name: user.display_name
                            };
                            res.redirect("/secure");
                        }
                        else {
                            res.status(401).render("error", { code: "401", message: "You do not have permission to access this website." });
                        }
                    }
                    else {
                        res.status(503).render("error", { code: "503", message: "Something went wrong with the Twitch API. Please try again." });
                    }
                });
            });
        }      
        else {
            res.status(403).render("error", { code: "403", message: "An invalid state parameter was returned. Please try again." });
        }
    }
    else {
        res.status(400).render("error", { code: "400", message: "Access to your account was denied." });
    }
});

// Handle Mark User Route
app.post("/mark", function(req, res) {
    // Update Record
    req.db.collection(config.app.year).updateOne({
        id: req.body.id
    }, {
        $set: {
            done: true
        }
    }, function(err, result) {
        // Check for Connection Error
        if (err) {
            res.status(503).send({ code: 503 });
        }
        else {
            res.status(200).send({ code: 200 });
        }
    })
});

// Handle Logout Route
app.get("/auth/logout", function(req, res) {
    req.session.destroy();
    res.redirect("/");
});

// Handle 404 Errors
app.get("*", function(req, res) {
    res.status(404);
});

// Check for Streams
function runCheck(offset) {
    restler.get("https://api.twitch.tv/helix/streams?first=100&community_id=" + config.twitch.community.charity + "&after=" + offset, {
        headers: {
            "User-Agent": "Twitch Subreddit Charity Effort",
            "Client-ID": config.twitch.auth.id
        }
    }).on("complete", function(resp) {
        var content = [];

        // Loop Through All Streams
        for (var stream of resp.data) {
            // Define Original Value
            var value = 0.05;

            if (stream.community_ids.indexOf(config.twitch.community.normal) === -1) {
                // Double Value Where Needed
                value = 0.1;
            }

            // Define Data Object
            var data = {
                id: stream.id,
                value: value,
                done: false
            };
            content.push(data);
        }

        // Make DB Changes
        content.forEach(function(stream) {
            // Check for Existing Record
            db.collection(config.app.year).findOne({
                id: stream.id
            }, function(err, result) {
                // Handle Connection Errors
                if (!err) {
                    // Check for Existing Record
                    if (result) {
                        // Update Record
                        db.collection(config.app.year).updateOne({
                            id: stream.id
                        }, {
                            $inc: {
                                value: stream.value
                            }
                        }, function(err, result) {
                            // Handle Connection Errors
                            if (!err) {
                                return;
                            }
                        });
                    }
                    else {
                        // Add Record
                        db.collection(config.app.year).insertOne(stream, function(err, result) {
                            // Handle Connection Errors
                            if (!err) {
                                return;
                            }
                        });
                    }
                }
            });
        });
        
        // Next Page
        if (resp.pagination.cursor) {
            runCheck(resp.pagination.cursor)
        }
    });
}

// Time Check for Streams
var task = cron.schedule('0 */5 * * * *', function() {
    console.log("[SERVER] Running Check")
    runCheck("");
});

// Run Server
var server = app.listen(config.app.port, function() {
    console.log("[SERVER] Listening on: " + config.app.port);
});