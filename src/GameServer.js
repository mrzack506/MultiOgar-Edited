// Library imports
var WebSocket = require('ws');
var http = require('http');
var fs = require("fs");

// Project imports
var Packet = require('./packet');
var PlayerTracker = require('./PlayerTracker');
var PacketHandler = require('./PacketHandler');
var Entity = require('./entity');
var Vec2 = require('./modules/Vec2');
var Logger = require('./modules/Logger');

// GameServer implementation
function GameServer() {
    // Location of source files - For renaming or moving source files!
    this.srcFiles = "../src";
    
    // Startup
    this.run = true;
    this.version = '1.5.0';
    this.httpServer = null;
    this.commands = null;
    this.lastNodeId = 1;
    this.lastPlayerId = 1;
    this.clients = [];
    this.socketCount = 0;
    this.largestClient = null;  // Required for spectators
    this.nodes = [];            // Total nodes
    this.nodesVirus = [];       // Virus nodes
    this.nodesFood = [];        // Food nodes
    this.nodesEjected = [];     // Ejected mass nodes
    this.nodesPlayer = [];
    
    this.movingNodes = [];      // For move engine
    this.leaderboard = [];      // For leaderboard
    this.leaderboardType = -1;  // No type
    
    var BotLoader = require('./ai/BotLoader');
    this.bots = new BotLoader(this);
    
    // Main loop tick
    this.startTime = Date.now();
    this.stepDateTime = 0;
    this.timeStamp = 0;
    this.updateTime = 0;
    this.updateTimeAvg = 0;
    this.timerLoopBind = null;
    this.mainLoopBind = null;
    this.tickCounter = 0;
    this.disableSpawn = false;

    // Config
    this.config = {
        /** LOGGING **/
        logVerbosity: 4,            // Console log level (0=NONE; 1=FATAL; 2=ERROR; 3=WARN; 4=INFO; 5=DEBUG)
        logFileVerbosity: 5,        // File log level
        
        /** SERVER **/
        serverTimeout: 300,         // Seconds to keep connection alive for non-responding client
        serverWsModule: 'ws',       // WebSocket module: 'ws' or 'uws' (install npm package before using uws)
        serverMaxConnections: 500,  // Maximum number of connections to the server. (0 for no limit)
        serverPort: 443,            // Server port which will be used to listen for incoming connections
        serverBind: '0.0.0.0',      // Server network interface which will be used to listen for incoming connections (0.0.0.0 for all IPv4 interfaces)
        serverTracker: 0,           // Set to 1 if you want to show your server on the tracker http://ogar.mivabe.nl/master (check that your server port is opened for external connections first!)
        serverGamemode: 0,          // Gamemodes: 0 = FFA, 1 = Teams, 2 = Experimental, 3 = Rainbow
        serverBots: 0,              // Number of player bots to spawn (Experimental)
        serverViewBaseX: 1920,      // Base view distance of players. Warning: high values may cause lag! Min value is 1920x1080
        serverViewBaseY: 1080,      // min value is 1920x1080
        serverMinScale: 0.15,       // Minimum viewbox scale for player (low value leads to lags due to large visible area for big cell)
        serverSpectatorScale: 0.4,  // Scale (field of view) used for free roam spectators (low value leads to lags, vanilla = 0.4, old vanilla = 0.25)
        serverStatsPort: 88,        // Port for stats server. Having a negative number will disable the stats server.
        serverStatsUpdate: 60,      // Update interval of server stats in seconds
        mobilePhysics: 0,           // Whether or not the server uses mobile agar.io physics
        
        /** CLIENT **/
        serverMaxLB: 10,            // Controls the maximum players displayed on the leaderboard.
        serverChat: 1,              // Allows the usage of server chat. 0 = no chat, 1 = use chat.
        serverChatAscii: 1,         // Set to 1 to disable non-ANSI letters in the chat (english only)
        serverName: 'MultiOgar-Edited #1',                  // Server name
        serverWelcome1: 'Welcome to MultiOgar-Edited!',     // First server welcome message
        serverWelcome2: '',         // Second server welcome message (optional, for info, etc)
        clientBind: '',             // Only allow connections to the server from specified client (eg: http://agar.io - http://mywebsite.com - http://more.com) [Use ' - ' to seperate different websites]
        
        /** ANTI-BOT **/
        serverIpLimit: 4,           // Controls the maximum number of connections from the same IP (0 for no limit)
        serverMinionIgnoreTime: 30, // minion detection disable time on server startup [seconds]
        serverMinionThreshold: 10,  // max connections within serverMinionInterval time period, which l not be marked as minion
        serverMinionInterval: 1000, // minion detection interval [milliseconds]
        serverScrambleLevel: 1,     // Toggles scrambling of coordinates. 0 = No scrambling, 1 = lightweight scrambling. 2 = full scrambling (also known as scramble minimap); 3 - high scrambling (no border)
        playerBotGrow: 0,           // Cells greater than 625 mass cannot grow from cells under 17 mass (set to 1 to disable)
        
        /** BORDER **/
        borderWidth: 14142.135623730952,  // Map border size (Vanilla value: 14142)
        borderHeight: 14142.135623730952, // Map border size (Vanilla value: 14142)
        
        /** FOOD **/
        foodMinSize: 10,            // Minimum food size (vanilla 10)
        foodMaxSize: 20,            // Maximum food size (vanilla 20)
        foodMinAmount: 1000,        // Minimum food cells on the map
        foodMaxAmount: 2000,        // Maximum food cells on the map
        foodSpawnAmount: 30,        // The number of food to spawn per interval
        foodMassGrow: 1,            // Enable food mass grow ?
        spawnInterval: 20,          // The interval between each food cell spawn in ticks (1 tick = 40 ms)
        
        /** VIRUSES **/
        virusMinSize: 100,          // Minimum virus size. (vanilla: mass = val*val/100 = 100 mass)
        virusMaxSize: 141.421356237, // Maximum virus size (vanilla: mass = val*val/100 = 200 mass)
        virusMinAmount: 50,         // Minimum number of viruses on the map.
        virusMaxAmount: 100,        // Maximum number of viruses on the map. If this number is reached, then ejected cells will pass through viruses.
        motherCellMaxMass: 0,       // Maximum amount of mass a mothercell is allowed to have (0 for no limit)
        virusVelocity: 780,         // Velocity of moving viruses (speed and distance)
        
        /** EJECTED MASS **/
        ejectSize: 40,              // vanilla: mass = val*val/100 = 16 mass
        ejectSizeLoss: 45,          // Eject size which will be substracted from player cell (vanilla: mass = val*val/100 = 20 mass?)
        ejectCooldown: 3,           // Tick count until a player can eject mass again in ticks (1 tick = 40 ms)
        ejectSpawnPercent: 0.5,     // Chance for a player to spawn from ejected mass. 0.5 = 50% (set to 0 to disable)
        ejectVirus: 0,              // Whether or not players can eject viruses instead of mass
        ejectVelocity: 780,         // Velocity of ejecting cells (speed and distance)
        
        /** PLAYERS **/
        playerMinSize: 31.6227766017, // Minimum size a player cell can decay too. (vanilla: val*val/100 = 10 mass)
        playerMaxSize: 1500,        // Maximum size a player cell can achive before auto-splitting. (vanilla: mass = val*val/100 = 22500 mass)
        playerMinSplitSize: 60,     // Mimimum size a player cell has to be to split. (vanilla: mass = val*val/100 = 36 mass)
        playerMinEjectSize: 56.56854249, // Minimum size a player cell has to be to eject mass. (vanilla: mass = val*val/100 = 32 mass)
        playerStartSize: 31.6227766017,  // Start size of the player cell. (vanilla: mass = val*val/100 = 10 mass)
        playerMaxCells: 16,         // Maximum cells a player is allowed to have.
        playerSpeed: 1,             // Player speed multiplier (1 = normal speed, 2 = twice the normal speed)
        playerDecayRate: 0.998,     // Amount of player cell size lost per second
        playerDecayCap: 0,          // Maximum mass a cell can have before it's decayrate multiplies by 10. (0 to disable)
        playerRecombineTime: 30,    // Base time in seconds before a cell is allowed to recombine
        playerDisconnectTime: -1,   // Time in seconds before a disconnected player's cell is removed (Set to -1 to never remove)
        playerMaxNickLength: 15,    // Maximum nick length
        splitVelocity: 780,         // Velocity of splitting cells (speed and distance)
        
        /** MINIONS **/
        minionStartSize: 31.6227766017,    // Start size of minions (mass = 32*32/100 = 10.24)
        minionMaxStartSize: 31.6227766017, // Maximum value of random start size for minions (set value higher than minionStartSize to enable)
        disableERTP: 1,             // Whether or not to disable ERTP controls for minions. (must use ERTPcontrol script in /scripts) (Set to 0 to enable)
        disableQ: 0,                // Whether or not to disable Q controls for minions. (Set 0 to enable)
        serverMinions: 0,           // Amount of minions each player gets once they spawn
        collectPellets: 0,          // Enable collect pellets mode. To use just press P or Q. (Warning: this disables Q controls, so make sure that disableERT is 0)
        defaultName: "minion",      // Default name for all minions if name is not specified using command (put <r> before the name for random skins!)
    };

    this.ipBanList = [];
    this.minionTest = [];
    this.userList = [];
    this.badWords = [];

    // Load files
    this.loadConfig();
    this.loadIpBanList();
    this.loadUserList();
    this.loadBadWords();
    
    // Set border, quad-tree
    var QuadNode = require('./modules/QuadNode.js');
    this.setBorder(this.config.borderWidth, this.config.borderHeight);
    this.quadTree = new QuadNode(this.border);
    
    // Gamemodes
    var Gamemode = require('./gamemodes');
    this.gameMode = Gamemode.get(this.config.serverGamemode);
}

module.exports = GameServer;

GameServer.prototype.start = function() {
    this.timerLoopBind = this.timerLoop.bind(this);
    this.mainLoopBind = this.mainLoop.bind(this);

    // Gamemode configurations
    this.gameMode.onServerInit(this);
    
    // Client Binding
    var bind = this.config.clientBind + "";
    this.clientBind = bind.split(' - ');
    
    // Start the server
    this.httpServer = http.createServer();
    var wsOptions = {
        server: this.httpServer, 
        perMessageDeflate: false,
        maxPayload: 4096
    };
    Logger.info("WebSocket: " + this.config.serverWsModule);
    WebSocket = require(this.config.serverWsModule);
    this.wsServer = new WebSocket.Server(wsOptions);
    this.wsServer.on('error', this.onServerSocketError.bind(this));
    this.wsServer.on('connection', this.onClientSocketOpen.bind(this));
    this.httpServer.listen(this.config.serverPort, this.config.serverBind, this.onHttpServerOpen.bind(this));

    // Start stats port (if needed)
    if (this.config.serverStatsPort > 0) {
        this.startStatsServer(this.config.serverStatsPort);
    }
};

GameServer.prototype.onHttpServerOpen = function() {
    // Start Main Loop
    setTimeout(this.timerLoopBind, 1);
    
    // Done
    Logger.info("Listening on port " + this.config.serverPort);
    Logger.info("Current game mode is " + this.gameMode.name);
    
    // Player bots (Experimental)
    if (this.config.serverBots) {
        for (var i = 0; i < this.config.serverBots; i++) {
            this.bots.addBot();
        }
        Logger.info("Added " + this.config.serverBots + " player bots");
    }
};

GameServer.prototype.addNode = function(node) {
    // Add to quad-tree & node list
    var x = node.position.x;
    var y = node.position.y;
    var size = node._size;
    node.quadItem = {
        cell: node, // update viewbox for players
        bound: { minx: x-size, miny: y-size, maxx: x+size, maxy: y+size }
    };
    this.quadTree.insert(node.quadItem);
    this.nodes.push(node);
    
    // Adds to the owning player's screen
    if (node.owner) {
        node.setColor(node.owner.color);
        node.owner.cells.push(node);
        node.owner.socket.sendPacket(new Packet.AddNode(node.owner, node));
    }

    // Special on-add actions
    node.onAdd(this);
};

GameServer.prototype.onServerSocketError = function(error) {
    Logger.error("WebSocket: " + error.code + " - " + error.message);
    switch (error.code) {
        case "EADDRINUSE":
            Logger.error("Server could not bind to port " + this.config.serverPort + "!");
            Logger.error("Please close out of Skype or change 'serverPort' in gameserver.ini to a different number.");
            break;
        case "EACCES":
            Logger.error("Please make sure you are running Ogar with root privileges.");
            break;
    }
    process.exit(1); // Exits the program
};

GameServer.prototype.onClientSocketOpen = function(ws) {
    var logip = ws._socket.remoteAddress + ":" + ws._socket.remotePort;
    ws.on('error', function(err) {
        Logger.writeError("[" + logip + "] " + err.stack);
    });
    if (this.config.serverMaxConnections && this.socketCount >= this.config.serverMaxConnections) {
        ws.close(1000, "No slots");
        return;
    }
    if (this.checkIpBan(ws._socket.remoteAddress)) {
        ws.close(1000, "IP banned");
        return;
    }
    if (this.config.serverIpLimit) {
        var ipConnections = 0;
        for (var i = 0; i < this.clients.length; i++) {
            var socket = this.clients[i];
            if (!socket.isConnected || socket.remoteAddress != ws._socket.remoteAddress)
                continue;
            ipConnections++;
        }
        if (ipConnections >= this.config.serverIpLimit) {
            ws.close(1000, "IP limit reached");
            return;
        }
    }
    if (this.config.clientBind.length && this.clientBind.indexOf(ws.upgradeReq.headers.origin) < 0) {
        ws.close(1000, "Client not allowed");
        return;
    }
    ws.isConnected = true;
    ws.remoteAddress = ws._socket.remoteAddress;
    ws.remotePort = ws._socket.remotePort;
    ws.lastAliveTime = Date.now();
    Logger.write("CONNECTED " + ws.remoteAddress + ":" + ws.remotePort + ", origin: \"" + ws.upgradeReq.headers.origin + "\"");
    
    var PlayerCommand = require('./modules/PlayerCommand');
    ws.playerTracker = new PlayerTracker(this, ws);
    ws.packetHandler = new PacketHandler(this, ws);
    ws.playerCommand = new PlayerCommand(this, ws.playerTracker);
    
    var onMessage = function(message) {
        if (!message.length) {
            return;
        }
        if (message.length > 256) {
            ws.close(1009, "Spam");
            return;
        }
        ws.packetHandler.handleMessage(message);
    };
    var onError = function(error) {
        ws.sendPacket = function(data) { };
    };
    var self = this;
    var onClose = function(reason) {
        if (ws._socket.destroy != null && typeof ws._socket.destroy == 'function') {
            ws._socket.destroy();
        }
        self.socketCount--;
        ws.isConnected = false;
        ws.sendPacket = function(data) { };
        ws.closeReason = { reason: ws._closeCode, message: ws._closeMessage };
        ws.closeTime = Date.now();
        Logger.write("DISCONNECTED " + ws.remoteAddress + ":" + ws.remotePort + ", code: " + ws._closeCode +
        ", reason: \"" + ws._closeMessage + "\", name: \"" + ws.playerTracker._name + "\"");
    };
    ws.on('message', onMessage);
    ws.on('error', onError);
    ws.on('close', onClose);
    this.socketCount++;
    this.clients.push(ws);
    
    // Check for external minions
    this.checkMinion(ws);
};

GameServer.prototype.checkMinion = function(ws) {
    // Check headers (maybe have a config for this?)
    if (!ws.upgradeReq.headers['user-agent'] || !ws.upgradeReq.headers['cache-control'] ||
        ws.upgradeReq.headers['user-agent'].length < 50) {
        ws.playerTracker.isMinion = true;
    }
    // External minion detection
    if (this.config.serverMinionThreshold) {
        if ((ws.lastAliveTime - this.startTime) / 1000 >= this.config.serverMinionIgnoreTime) {
            if (this.minionTest.length >= this.config.serverMinionThreshold) {
                ws.playerTracker.isMinion = true;
                for (var i = 0; i < this.minionTest.length; i++) {
                    var playerTracker = this.minionTest[i];
                    if (!playerTracker.socket.isConnected) continue;
                    playerTracker.isMinion = true;
                }
                if (this.minionTest.length) this.minionTest.splice(0, 1);
            }
            this.minionTest.push(ws.playerTracker);
        }
    }
    // Add server minions if needed
    if (this.config.serverMinions && !ws.playerTracker.isMinion) {
        for (var i = 0; i < this.config.serverMinions; i++) {
            this.bots.addMinion(ws.playerTracker);
            ws.playerTracker.minionControl = true;
        }
    }
};

GameServer.prototype.checkIpBan = function(ipAddress) {
    if (!this.ipBanList || !this.ipBanList.length || ipAddress == "127.0.0.1") {
        return false;
    }
    if (this.ipBanList.indexOf(ipAddress) >= 0) {
        return true;
    }
    var ipBin = ipAddress.split('.');
    if (ipBin.length != 4) {
        // unknown IP format
        return false;
    }
    var subNet2 = ipBin[0] + "." + ipBin[1] + ".*.*";
    if (this.ipBanList.indexOf(subNet2) >= 0) {
        return true;
    }
    var subNet1 = ipBin[0] + "." + ipBin[1] + "." + ipBin[2] + ".*";
    if (this.ipBanList.indexOf(subNet1) >= 0) {
        return true;
    }
    return false;
};

GameServer.prototype.setBorder = function(width, height) {
    var hw = width / 2;
    var hh = height / 2;
    this.border = {
        minx: -hw, miny: -hh, maxx: hw, maxy: hh, width: width, height: height
    };
};

GameServer.prototype.getRandomColor = function() {
    // get random
    var colorRGB = [0xFF, 0x07, (Math.random() * 256) >> 0];
    colorRGB.sort(function() {
        return 0.5 - Math.random();
    });
    // return random
    return {
        r: colorRGB[0],
        b: colorRGB[1],
        g: colorRGB[2]
    };
};

GameServer.prototype.removeNode = function(node) {
    // Remove from quad-tree
    node.isRemoved = true;
    this.quadTree.remove(node.quadItem);
    node.quadItem = null;
    
    // Remove from main nodes list
    var index = this.nodes.indexOf(node);
    if (index != -1) {
        this.nodes.splice(index, 1);
    }
    
    // Remove from moving cells list
    index = this.movingNodes.indexOf(node);
    if (index != -1) {
        this.movingNodes.splice(index, 1);
    }
    
    // Special on-remove actions
    node.onRemove(this);
};

GameServer.prototype.updateClients = function() {
    // check dead clients
    var len = this.clients.length;
    for (var i = 0; i < len; ) {
    	if (!this.clients[i]) {
    		i++;
    		continue;
    	}
        this.clients[i].playerTracker.checkConnection();
        if (this.clients[i].playerTracker.isRemoved)
            // remove dead client
            this.clients.splice(i, 1);
        else
            i++;
    }
    // update
    for (var i = 0; i < len; i++) {
    	if (!this.clients[i]) continue;
        this.clients[i].playerTracker.updateTick();
    }
    for (var i = 0; i < len; i++) {
    	if (!this.clients[i]) continue;
        this.clients[i].playerTracker.sendUpdate();
    }

    // check minions
    for (var i = 0, test = this.minionTest.length; i < test; ) {
        if (!this.minionTest[i]) {
            i++;
            continue;
        }
        var date = new Date() - this.minionTest[i].connectedTime;
        if (date > this.config.serverMinionInterval)
            this.minionTest.splice(i, 1);
        else
            i++;
    }
};

GameServer.prototype.updateLeaderboard = function() {
    // Update leaderboard with the gamemode's method
    this.leaderboard = [];
    this.leaderboardType = -1;
    this.gameMode.updateLB(this);
    
    if (!this.gameMode.specByLeaderboard) {
        // Get client with largest score if gamemode doesn't have a leaderboard
        var clients = this.clients.valueOf();
        
        // Use sort function
        clients.sort(function(a, b) {
            return b.playerTracker._score - a.playerTracker._score;
        });
        this.largestClient = null;
        if (clients[0]) this.largestClient = clients[0].playerTracker;
    } else {
        this.largestClient = this.gameMode.rankOne;
    }
};

GameServer.prototype.onChatMessage = function(from, to, message) {
    if (!message) return;
    message = message.trim();
    if (message === "") return;
    if (from && message.length && message[0] == '/') {
        // player command
        message = message.slice(1, message.length);
        from.socket.playerCommand.executeCommandLine(message);
        return;
    }
    if (!this.config.serverChat || (from && from.isMuted)) {
        // chat is disabled or player is muted
        return;
    }
    if (message.length > 64) {
        message = message.slice(0, 64);
    }
    if (this.config.serverChatAscii) {
        for (var i = 0; i < message.length; i++) {
            if ((message.charCodeAt(i) < 0x20 || message.charCodeAt(i) > 0x7F) && from) {
                this.sendChatMessage(null, from, "You can use ASCII text only!");
                return;
            }
        }
    }
    if (this.checkBadWord(message) && from) {
        this.sendChatMessage(null, from, "Stop insulting others! Keep calm and be friendly please");
        return;
    }
    this.sendChatMessage(from, to, message);
};

GameServer.prototype.checkBadWord = function(value) {
    if (!value) return false;
    value = value.toLowerCase().trim();
    if (!value) return false;
    for (var i = 0; i < this.badWords.length; i++) {
        if (value.indexOf(this.badWords[i]) >= 0) {
            return true;
        }
    }
    return false;
};

GameServer.prototype.sendChatMessage = function(from, to, message) {
    for (var i = 0, len = this.clients.length; i < len; i++) {
        if (!this.clients[i]) continue;
        if (!to || to == this.clients[i].playerTracker)
            this.clients[i].sendPacket(new Packet.ChatMessage(from, message));
    }
};

GameServer.prototype.timerLoop = function() {
    var timeStep = 40; // vanilla: 40
    var ts = Date.now();
    var dt = ts - this.timeStamp;
    if (dt < timeStep - 5) {
        setTimeout(this.timerLoopBind, timeStep - 5 - dt);
        return;
    }
    if (dt > 120) this.timeStamp = ts - timeStep;
    // update average, calculate next
    this.updateTimeAvg += 0.5 * (this.updateTime - this.updateTimeAvg);
    this.timeStamp += timeStep;
    setTimeout(this.mainLoopBind, 0);
    setTimeout(this.timerLoopBind, 0);
};

GameServer.prototype.mainLoop = function() {
    this.stepDateTime = Date.now();
    var tStart = process.hrtime();
    var self = this;
    
    // Loop main functions
    if (this.run) {
        // Move moving nodes first
        for (var i = 0, len = this.movingNodes.length; i < len; i++) {
            var cell = this.movingNodes[i];
            if (!cell || cell.isRemoved || cell.cellType == 1) 
                continue;
            // Scan and check for ejected mass / virus collisions
            this.boostCell(cell);
            this.quadTree.find(cell.quadItem.bound, function(item) {
                var m = self.checkCellCollision(cell, item.cell);
                if (item.cell.cellType == 3 && !self.config.mobilePhysics)
                    self.resolveRigidCollision(m);
                else
                    self.resolveCollision(m);
            });
            if (!cell.isMoving)
                this.movingNodes = null;
        }
        // Move players and scan for collisions
        for (var i = 0, len = this.nodesPlayer.length; i < len; i++) {
            var cell = this.nodesPlayer[i];
            if (!cell || cell.isRemoved) continue;
            this.movePlayer(cell, cell.owner);
            this.autoSplit(cell, cell.owner);
            // Scan for player cells collisions
            this.quadTree.find(cell.quadItem.bound, function(item) {
                var m = self.checkCellCollision(cell, item.cell);
                if (self.checkRigidCollision(m))
                    self.resolveRigidCollision(m);
                else if (item.cell != cell)
                    self.resolveCollision(m);
            });
            this.boostCell(cell);
            // Decay player cells once per second
            if (((this.tickCounter + 3) % 25) === 0)
                this.updateMassDecay(cell);
        }
        if ((this.tickCounter % this.config.spawnInterval) === 0) {
            // Spawn food & viruses
            this.spawnCells(this.randomPos());
        }
        this.gameMode.onTick(this);
        this.tickCounter++;
    }
    this.updateClients();

    // update leaderboard
    if (((this.tickCounter + 7) % 25) === 0)
        this.updateLeaderboard(); // once per second

    // ping server tracker
    if (this.config.serverTracker && (this.tickCounter % 750) === 0)
        this.pingServerTracker(); // once per 30 seconds

    // update-update time
    var tEnd = process.hrtime(tStart);
    this.updateTime = tEnd[0] * 1e3 + tEnd[1] / 1e6;
};

// update remerge first
GameServer.prototype.movePlayer = function(cell, client) {
    if (client.socket.isConnected == false || client.frozen)
        return; // Do not move

    // get movement from vector
    var d = cell.position.clone().sub(client.mouse).scale(-1);
    var move = cell.getSpeed(~~d.sqDist(d)); // movement speed
    if (!move) return; // avoid jittering
    cell.position.add2(d, move);

    // update remerge
    var time = this.config.playerRecombineTime,
    base = Math.max(time, cell._size * 0.2) * 25;
    // instant merging conditions
    if (!time || client.rec || client.mergeOverride) {
        cell._canRemerge = cell.boostDistance < 100;
        return; // instant merge
    }
    // regular remerge time
    cell._canRemerge = cell.getAge() >= base;
};

// decay player cells
GameServer.prototype.updateMassDecay = function(cell) {
    var rate = this.config.playerDecayRate,
        cap = this.config.playerDecayCap,
        size = cell._size;

    if (!rate || size <= this.config.playerMinSize)
        return;

    // get actual decay rate
    if (cap && cell._mass > cap) rate *= 10;
    var decay = 1 - rate * this.gameMode.decayMod;

    // remove size from cell
    size = Math.sqrt(size * size * decay);
    size = Math.max(size, this.config.playerMinSize);
    cell.setSize(size);
};

GameServer.prototype.boostCell = function(cell) {
    if (cell.isMoving && !cell.boostDistance || cell.isRemoved) {
        cell.boostDistance = 0;
        cell.isMoving = false;
        return;
    }
    // decay boost-speed from distance
    var speed = cell.boostDistance / 9; // val: 87
    cell.boostDistance -= speed; // decays from speed
    cell.position.add2(cell.boostDirection, speed)

    // update boundries
    cell.checkBorder(this.border);
    this.updateNodeQuad(cell);
};

GameServer.prototype.autoSplit = function(cell, client) {
    // get size limit based off of rec mode
    if (!client.rec) var maxSize = this.config.playerMaxSize; 
    else maxSize = 1e9; // increase limit for rec (1 bil)

    // check size limit
    if (client.mergeOverride || cell._size < maxSize) return;
    if (client.cells.length >= this.config.playerMaxCells || this.config.mobilePhysics) {
        // cannot split => just limit
        cell.setSize(maxSize);
    } else {
        // split in random direction
        var angle = Math.random() * 2 * Math.PI;
        this.splitPlayerCell(client, cell, angle, cell._mass * .5);
    }
};

GameServer.prototype.updateNodeQuad = function(node) {
    // update quad tree
    var item = node.quadItem.bound;
    item.minx = node.position.x - node._size;
    item.miny = node.position.y - node._size;
    item.maxx = node.position.x + node._size;
    item.maxy = node.position.y + node._size;
    this.quadTree.remove(node.quadItem);
    this.quadTree.insert(node.quadItem);
};

// Checks cells for collision
GameServer.prototype.checkCellCollision = function(cell, check) {
    var p = check.position.clone().sub(cell.position);
    var d = p.sqDist(p);

    // create collision manifold
    return {
        cell: cell,
        check: check,
        d: d,          // distance from cell to check
        p: p           // check - cell position
    };
};

// Checks if collision is rigid body collision
GameServer.prototype.checkRigidCollision = function(m) {
    if (!m.cell.owner || !m.check.owner)
        return false;
    if (m.cell.owner != m.check.owner) {
        // Different owners => same team
        return this.gameMode.haveTeams && 
            m.cell.owner.team == m.check.owner.team;
    }
    var r = this.config.mobilePhysics ? 1 : 13;
    if (m.cell.getAge() < r || m.check.getAge() < r) {
        return false; // just splited => ignore
    }
    return !m.cell._canRemerge || !m.check._canRemerge;
};

// Resolves rigid body collision for player cells
GameServer.prototype.resolveRigidCollision = function(m) {
    var r = m.cell._size + m.check._size; // radius sum of cell & check
    var push = Math.min((r - m.d) / m.d, r - m.d); // min extrusion force
    if (push / r < 0) return;

    // body impulse (TODO: convert to size)
    var total = m.cell._mass + m.check._mass;
    var m1 = push * m.cell._mass / total;
    var m2 = push * m.check._mass / total;

    // apply extrusion force
    m.cell.position.sub2(m.p, m2);
    m.check.position.add2(m.p, m1);
};

// Resolves non-rigid body collision
GameServer.prototype.resolveCollision = function(m) {
    var cell = m.cell;
    var check = m.check;
    if (cell._size > check._size) {
        cell = m.check;
        check = m.cell;
    }
    // Do not resolve removed
    if (cell.isRemoved || check.isRemoved)
        return;

    // check eating distance
    var div = this.config.mobilePhysics ? 20 : 3;
    if (m.d >= check._size - cell._size / div) {
        return; // too far => can't eat
    }

    // collision owned => ignore, resolve, or remerge
    if (cell.owner && cell.owner == check.owner) {
        if (cell.getAge() < 13 || check.getAge() < 13)
            return; // just splited => ignore
    } else if (check._size < cell._size * 1.11 || !check.canEat(cell))
        return; // Cannot eat or cell refuses to be eaten

    // Consume effect
    check.onEat(cell);
    cell.onEaten(check);
    cell.killedBy = check;

    // Remove cell
    this.removeNode(cell);
};

GameServer.prototype.splitPlayerCell = function(client, parent, angle, mass) {
    var size = Math.sqrt(mass * 100);
    var size1 = Math.sqrt(parent._size * parent._size - size * size);

    // Too small to split
    if (isNaN(size1) || size < this.config.playerMinSize) 
        return;

    // Remove size from parent cell
    parent.setSize(size1);
    
    // Get new position
    var pos = parent.position.clone();
    
    // Create cell and add it to node list
    var newCell = new Entity.PlayerCell(this, client, pos, size);
    newCell.setBoost(this.config.splitVelocity, angle);
    this.addNode(newCell);
};

GameServer.prototype.randomPos = function() {
    return new Vec2(
        this.border.minx + this.border.width * Math.random(),
        this.border.miny + this.border.height * Math.random()
    );
};

GameServer.prototype.spawnCells = function(pos) {
    // spawn food at random size
    var maxCount = this.config.foodMinAmount - this.nodesFood.length;
    var spawnCount = Math.min(maxCount, this.config.foodSpawnAmount);
    for (var i = 0; i < spawnCount; i++) {
        var cell = new Entity.Food(this, null, this.randomPos(), this.config.foodMinSize);
        if (this.config.foodMassGrow) {
            var maxGrow = this.config.foodMaxSize - cell._size;
            cell.setSize(cell._size += maxGrow * Math.random());
        }
        cell.setColor(this.getRandomColor());
        this.addNode(cell);
    }

    // spawn viruses (safely)
    maxCount = this.config.virusMinAmount - this.nodesVirus.length;
    spawnCount = Math.min(maxCount, 2);
    for (var i = 0; i < spawnCount; i++) {
        if (willCollide(pos, this.config.virusMinSize))
            pos = this.randomPos();
        var v = new Entity.Virus(this, null, pos, this.config.virusMinSize);
        this.addNode(v);
    }
};

GameServer.prototype.spawnPlayer = function(player, pos) {
    if (this.disableSpawn) return; // Not allowed to spawn!
    
    // Check for special start size(s)
    var size = this.config.playerStartSize;
    if (player.spawnmass && !player.isMi) {
        size = player.spawnmass;
    } else if (player.isMi) {
        size = this.config.minionStartSize,
        maxStart = this.config.minionMaxStartSize;
        if (maxStart > size)
            size = Math.random() * (maxStart - size) + size;
    }
    // Check if can spawn from ejected mass
    var index = (this.nodesEjected.length - 1) * ~~Math.random();
    var eject = this.nodesEjected[index]; // Randomly selected
    if (eject && !eject.isRemoved && eject.boostDistance < 1 &&
        Math.random() <= this.config.ejectSpawnPercent) {
        // Spawn from ejected mass
        pos = eject.position.clone();
        player.setColor(eject.color);
        size = Math.max(size, eject._size * 1.15)
    }
    // Spawn player safely
    if (willCollide(pos, size) && !player.isMi) 
        pos = this.randomPos();

    // Spawn player and add to world
    var cell = new Entity.PlayerCell(this, player, pos, size);
    this.addNode(cell);

    // Set initial mouse coords
    player.mouse = new Vec2(pos.x, pos.y);

    // Remove external minions if necessary
    if (player.isMinion) {
        player.socket.close(1000, "Marked as minion");
        this.removeNode(cell);
    }
};

function willCollide(pos, size) {
    var sqSize = size * size;
    var d = pos.clone();
    if (d.dist(d) + sqSize <= sqSize * 2)
        return false; // not safe
    else return true;
}

GameServer.prototype.splitCells = function(client) {
    // Split cell order decided by cell age
    var cellToSplit = [];
    for (var i = 0; i < client.cells.length; i++) {
        if (client.cells[i]._size < this.config.playerMinSplitSize)
            continue; // cannot split
        cellToSplit.push(client.cells[i]);
    }

    // Split split-able cells
    for (var i = 0; i < cellToSplit.length; i++) {
        var cell = cellToSplit[i];
        var d = cell.position.clone().sub(client.mouse).scale(-1);
        if (d.dist(~~d) < 1) {
            d.x = 1, d.y = 0;
        }

        // Get maximum cells for rec mode
        if (!client.rec) var max = this.config.playerMaxCells;
        else max = 200; // increase limit for rec (200 cells)
        if (client.cells.length >= max) return;

        // Now split player cells
        this.splitPlayerCell(client, cell, d.angle(d), cell._mass*.5);
    }
};

GameServer.prototype.canEjectMass = function(client) {
    if (client.lastEject === null) {
        // first eject
        client.lastEject = this.tickCounter;
        return true;
    }
    var dt = this.tickCounter - client.lastEject;
    if (dt < this.config.ejectCooldown) {
        // reject (cooldown)
        return false;
    }
    client.lastEject = this.tickCounter;
    return true;
};

GameServer.prototype.ejectMass = function(client) {
    if (!this.canEjectMass(client) || client.frozen)
        return;
    for (var i = 0; i < client.cells.length; i++) {
        var cell = client.cells[i];
        
        if (cell._size < this.config.playerMinEjectSize)
            continue; // Too small to eject
        
        var d = cell.position.clone().sub(client.mouse).scale(-1);
        var sq = d.sqDist(d);
        d.x = sq > 1 ? d.x / sq : 1;
        d.y = sq > 1 ? d.y / sq : 0;
        
        // Remove mass from parent cell first
        var loss = this.config.ejectSizeLoss;
        loss = cell._sizeSquared - loss * loss;
        cell.setSize(Math.sqrt(loss));
        
        // Get starting position
        var pos = new Vec2(
            cell.position.x + d.x * cell._size,
            cell.position.y + d.y * cell._size
        );
        var angle = d.angle(d) + (Math.random() * .6) - .3;
        
        // Create cell and add it to node list
        if (!this.config.ejectVirus) {
            var ejected = new Entity.EjectedMass(this, null, pos, this.config.ejectSize);
        } else {
            ejected = new Entity.Virus(this, null, pos, this.config.ejectSize);
        }
        ejected.setColor(cell.color);
        ejected.setBoost(this.config.ejectVelocity, angle);
        this.addNode(ejected);
    }
};

GameServer.prototype.shootVirus = function(parent, angle) {
    // Create virus and add it to node list
    var pos = parent.position.clone();
    var newVirus = new Entity.Virus(this, null, pos, this.config.virusMinSize);
    newVirus.setBoost(this.config.virusVelocity, angle);
    this.addNode(newVirus);
};

GameServer.prototype.loadConfig = function() {
    var fileNameConfig = this.srcFiles + '/gameserver.ini';
    var ini = require(this.srcFiles + '/modules/ini.js');
    try {
        if (!fs.existsSync(fileNameConfig)) {
            // No config
            Logger.warn("Config not found... Generating new config");
            // Create a new config
            fs.writeFileSync(fileNameConfig, ini.stringify(this.config), 'utf-8');
        } else {
            // Load the contents of the config file
            var load = ini.parse(fs.readFileSync(fileNameConfig, 'utf-8'));
            // Replace all the default config's values with the loaded config's values
            for (var key in load) {
                if (this.config.hasOwnProperty(key)) this.config[key] = load[key];
                else Logger.error("Unknown gameserver.ini value: " + key);
            }
        }
    } catch (err) {
        Logger.error(err.stack);
        Logger.error("Failed to load " + fileNameConfig + ": " + err.message);
    }
    Logger.setVerbosity(this.config.logVerbosity);
    Logger.setFileVerbosity(this.config.logFileVerbosity);
};

GameServer.prototype.loadBadWords = function() {
    var fileNameBadWords = this.srcFiles + '/badwords.txt';
    try {
        if (!fs.existsSync(fileNameBadWords)) {
            Logger.warn(fileNameBadWords + " not found");
        } else {
            var words = fs.readFileSync(fileNameBadWords, 'utf-8');
            words = words.split(/[\r\n]+/);
            words = words.map(function(arg) { return arg.trim().toLowerCase(); });
            words = words.filter(function(arg) { return !!arg; });
            this.badWords = words;
            Logger.info(this.badWords.length + " bad words loaded");
        }
    } catch (err) {
        Logger.error(err.stack);
        Logger.error("Failed to load " + fileNameBadWords + ": " + err.message);
    }
};

GameServer.prototype.loadUserList = function() {
    var UserRoleEnum = require(this.srcFiles + '/enum/UserRoleEnum');
    var fileNameUsers = this.srcFiles + '/enum/userRoles.json';
    try {
        this.userList = [];
        if (!fs.existsSync(fileNameUsers)) {
            Logger.warn(fileNameUsers + " is missing.");
            return;
        }
        var usersJson = fs.readFileSync(fileNameUsers, 'utf-8');
        var list = JSON.parse(usersJson.trim());
        for (var i = 0; i < list.length; ) {
            var item = list[i];
            if (!item.hasOwnProperty("ip") ||
                !item.hasOwnProperty("password") ||
                !item.hasOwnProperty("role") ||
                !item.hasOwnProperty("name")) {
                list.splice(i, 1);
                continue;
            }
            if (!item.password || !item.password.trim()) {
                Logger.warn("User account \"" + item.name + "\" disabled");
                list.splice(i, 1);
                continue;
            }
            if (item.ip) item.ip = item.ip.trim();
            item.password = item.password.trim();
            if (!UserRoleEnum.hasOwnProperty(item.role)) {
                Logger.warn("Unknown user role: " + item.role);
                item.role = UserRoleEnum.USER;
            } else {
                item.role = UserRoleEnum[item.role];
            }
            item.name = (item.name || "").trim();
            i++;
        }
        this.userList = list;
        Logger.info(this.userList.length + " user records loaded.");
    } catch (err) {
        Logger.error(err.stack);
        Logger.error("Failed to load " + fileNameUsers + ": " + err.message);
    }
};

GameServer.prototype.loadIpBanList = function() {
    var fileNameIpBan = this.srcFiles + '/ipbanlist.txt';
    try {
        if (fs.existsSync(fileNameIpBan)) {
            // Load and input the contents of the ipbanlist file
            this.ipBanList = fs.readFileSync(fileNameIpBan, "utf8").split(/[\r\n]+/).filter(function(x) {
                return x != ''; // filter empty lines
            });
            Logger.info(this.ipBanList.length + " IP ban records loaded.");
        } else {
            Logger.warn(fileNameIpBan + " is missing.");
        }
    } catch (err) {
        Logger.error(err.stack);
        Logger.error("Failed to load " + fileNameIpBan + ": " + err.message);
    }
};

// Custom prototype function
WebSocket.prototype.sendPacket = function(packet) {
    if (packet == null) return;
    if (this.readyState == WebSocket.OPEN) {
        if (this._socket.writable != null && !this._socket.writable)
            return;
        var buffer = packet.build(this.playerTracker.socket.packetHandler.protocol);
        if (buffer != null) this.send(buffer, { binary: true });
    } else {
        this.readyState = WebSocket.CLOSED;
        this.emit('close');
    }
};

GameServer.prototype.startStatsServer = function(port) {
    // Create stats
    this.stats = "Test";
    this.getStats();
    
    // Show stats
    this.httpServer = http.createServer(function(req, res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.writeHead(200);
        res.end(this.stats);
    }.bind(this));
    this.httpServer.on('error', function(err) {
        Logger.error("Stats Server: " + err.message);
    });
    
    var getStatsBind = this.getStats.bind(this);
    this.httpServer.listen(port, function() {
        // Stats server
        Logger.info("Started stats server on port " + port);
        setInterval(getStatsBind, this.config.serverStatsUpdate * 1000);
    }.bind(this));
};

GameServer.prototype.getStats = function() {
    // Get server statistics
    var totalPlayers = 0;
    var alivePlayers = 0;
    var spectatePlayers = 0;
    for (var i = 0, len = this.clients.length; i < len; i++) {
        var socket = this.clients[i];
        if (!socket || !socket.isConnected)
            continue;
        totalPlayers++;
        if (socket.playerTracker.cells.length) alivePlayers++;
        else spectatePlayers++;
    }
    var s = {
        'server_name': this.config.serverName,
        'server_chat': this.config.serverChat ? "true" : "false",
        'border_width': this.border.width,
        'border_height': this.border.height,
        'gamemode': this.gameMode.name,
        'max_players': this.config.serverMaxConnections,
        'current_players': totalPlayers,
        'alive': alivePlayers,
        'spectators': spectatePlayers,
        'update_time': this.updateTimeAvg.toFixed(3),
        'uptime': Math.round((this.stepDateTime - this.startTime) / 1000 / 60),
        'start_time': this.startTime
    };
    this.stats = JSON.stringify(s);
};

// Pings the server tracker, should be called every 30 seconds
// To list us on the server tracker located at http://ogar.mivabe.nl/master
GameServer.prototype.pingServerTracker = function() {
    // Get server statistics
    var os = require('os');
    var totalPlayers = 0;
    var alivePlayers = 0;
    var spectatePlayers = 0;
    var robotPlayers = 0;
    for (var i = 0, len = this.clients.length; i < len; i++) {
        var socket = this.clients[i];
        if (!socket || socket.isConnected == false)
            continue;
        if (socket.isConnected == null) {
            robotPlayers++;
        } else {
            totalPlayers++;
            if (socket.playerTracker.cells.length) alivePlayers++;
            else spectatePlayers++;
        }
    }

    // ogar-tracker.tk
    var obj = {
        port: this.config.serverPort,               // [mandatory] web socket port which listens for game client connections
        name: this.config.serverName,               // [mandatory] server name
        mode: this.gameMode.name,                   // [mandatory] game mode
        total: totalPlayers,                        // [mandatory] total online players (server bots is not included!)
        alive: alivePlayers,                        // [mandatory] alive players (server bots is not included!)
        spect: spectatePlayers,                     // [mandatory] spectate players (server bots is not included!)
        robot: robotPlayers,                        // [mandatory] server bots
        limit: this.config.serverMaxConnections,    // [mandatory] maximum allowed connection count
        protocol: 'M',                              // [mandatory] required protocol id or 'M' for multiprotocol (if all protocols is supported)   
        uptime: process.uptime() >> 0,              // [mandatory] server uptime [seconds]
        w: this.border.width >> 0,                  // [mandatory] map border width [integer]
        h: this.border.height >> 0,                 // [mandatory] map border height [integer]
        version: 'MultiOgar-Edited ' + this.version,       // [optional]  server version
        stpavg: this.updateTimeAvg >> 0,            // [optional]  average server loop time
        chat: this.config.serverChat ? 1 : 0,       // [optional]  0 - chat disabled, 1 - chat enabled
        os: os.platform()                           // [optional]  operating system
    };
    trackerRequest({
        host: 'ogar-tracker.tk',
        port: 80,
        path: '/api/ping',
        method: 'PUT'
    }, 'application/json', JSON.stringify(obj));
    

    // mivabe.nl
    var data = 'current_players=' + totalPlayers +
               '&alive=' + alivePlayers +
               '&spectators=' + spectatePlayers +
               '&max_players=' + this.config.serverMaxConnections +
               '&sport=' + this.config.serverPort +
               '&gamemode=[**] ' + this.gameMode.name +             // we add [**] to indicate that this is MultiOgar-Edited server
               '&agario=true' +                                     // protocol version
               '&name=Unnamed Server' +                             // we cannot use it, because other value will be used as dns name
               '&opp=' + os.platform() + ' ' + os.arch() +          // "win32 x64"
               '&uptime=' + process.uptime() +                      // Number of seconds server has been running
               '&version=MultiOgar-Edited ' + this.version +
               '&start_time=' + this.startTime;
    trackerRequest({
        host: 'ogar.mivabe.nl',
        port: 80,
        path: '/master',
        method: 'POST'
    }, 'application/x-www-form-urlencoded', data);
    
    // c0nsume.me
    trackerRequest({
        host: 'c0nsume.me',
        port: 80,
        path: '/tracker.php',
        method: 'POST'
    }, 'application/x-www-form-urlencoded', data);
};

function trackerRequest(options, type, body) {
    if (options.headers == null) options.headers = {};
    options.headers['user-agent'] = 'MultiOgar-Edited' + this.version;
    options.headers['content-type'] = type;
    options.headers['content-length'] = body == null ? 0 : Buffer.byteLength(body, 'utf8');
    var req = http.request(options, function(res) {
        if (res.statusCode != 200) {
            Logger.writeError("[Tracker][" + options.host + "]: statusCode = " + res.statusCode);
            return;
        }
        res.setEncoding('utf8');
    });
    req.on('error', function(err) {
        Logger.writeError("[Tracker][" + options.host + "]: " + err);
    });
    req.shouldKeepAlive = false;
    req.on('close', function() {
        req.destroy();
    });
    req.write(body);
    req.end();
}
