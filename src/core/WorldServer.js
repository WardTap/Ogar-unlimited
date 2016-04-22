'use strict';
var utilities = require('./utilities.js');
var Entity = require('../entity');
const DataBaseConnector = require('./DataBaseConnector.js');
const ConfigService = require('./ConfigService.js');

module.exports = class WorldServer {
  constructor(world) {
    // Config
    this.configService = new ConfigService();
    this.config = this.configService.registerListner('config', (config)=>{
      this.config = config;
      this.foodSpawnRate = this.config.foodSpawnAmount / 60;
    });

    // food to spawn per second

    // the amount of food we have spawned
    this.foodSpawned = 0;


    this.interval = undefined;
    this.dataBase = new DataBaseConnector('world');
    this.world = world; // todo this is temp
  }

  init() {
    this.world.initNodeType('player');
    this.world.initNodeType('moving');
    this.world.initNodeType('ejected');
    this.world.initNodeType('virus');
    this.world.initNodeType('food');
    this.world.initNodeType('rainbow');


    for (var i = 0; i < this.config.foodStartAmount; i++) {
      this.spawnFood();
    }
  }

  start() {
    console.log('generator start');
    this.startTime = new Date();
    this.updateTime = this.startTime;
    this.foodSpawned = 0;
    this.interval = setInterval(this.update.bind(this), 1);
  }

  stop() {
    clearInterval(this.interval);
  }

  update() {
    if (this.world.getNodes('food').length < this.config.foodMaxAmount) {
      let currentFoodSpawnRate = this.foodSpawned / (new Date() - this.startTime) * 1000;
      let toSpawn = this.foodSpawnRate - currentFoodSpawnRate;
      toSpawn = (toSpawn > this.foodSpawnRate) ? 0 : toSpawn;
      for (let i = 0; i < toSpawn; i++) {
        this.spawnFood();
      }
    }
    this.virusCheck();
  }

  spawnFood() {
    this.foodSpawned++;
    let pos = this.world.getRandomPosition();
    let f = new Entity.Food(this.world.getNextNodeId(), null, pos, this.config.foodMass, this.world, this.config);
    f.setColor(utilities.getRandomColor());

    //this.dataBase.put(f.toJSON());

    this.world.setNode(f.getId(), f, 'food');
  };

  virusCheck() {
    if (!this.config.spawnVirus) return;

    // Checks if there are enough viruses on the map
    let virusNodes = this.world.getNodes('virus');
    if (virusNodes.length < this.config.virusMinAmount) {
      // Spawns a virus
      let pos = this.world.getRandomPosition();
      let virusSquareSize = (this.config.virusStartMass * 100) >> 0;

      // Check for players
      let result = this.world.getNodes('player').some((check)=> {
        if (check.mass < this.config.virusStartMass) return false;

        var squareR = check.getSquareSize(); // squared Radius of checking player cell

        var dx = check.position.x - pos.x;
        var dy = check.position.y - pos.y;

        if (dx * dx + dy * dy + virusSquareSize <= squareR)
          return true; // Collided
      });
      if (result) return;

      // Spawn if no cells are colliding
      let v = new Entity.Virus(this.world.getNextNodeId(), null, pos, this.config.virusStartMass, this.world, this.config);
      this.world.setNode(v.getId(), v, 'virus');
    }
  };

  getRandomSpawn() {
    // Random spawns for players
    let pos = undefined;

    if (this.world.getNodes('food').length > 0) {
      // Spawn from food
      let nodes = this.world.getNodes('food');
      nodes.some((node)=> {
        if (!node || node.inRange) {
          // Skip if food is about to be eaten/undefined
          return false;
        }

        if (node.getType() == 1) {
          pos = {
            x: node.position.x,
            y: node.position.y
          };
          this.removeNode(node);
          return true;
        }
      });
    }

    // Return random spawn if no food cell is found
    return (pos) ? pos : this.world.getRandomPosition();
  }

  getCurrentFood() {
    return this.world.getNodes('food').length;
  }

  removeNode(node) {
    this.world.removeNode(node.getId());
    // Special on-remove actions
    node.onRemove(this);

    // todo this is a big problem for splitting up the processes
    // Animation when eating
    let clients = this.world.getClients();
    for (let i = 0; i < clients.length; i++) {
      let client = clients[i].playerTracker;
      if (!client) {
        continue;
      }

      // Remove from client
      client.nodeDestroyQueue.push(node);
    }
  }
};