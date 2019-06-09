(function() {
	var timeouts = [];
	var messageName = "zero-timeout-message";

	function setZeroTimeout(fn) {
		timeouts.push(fn);
		window.postMessage(messageName, "*");
	}

	function handleMessage(event) {
		if (event.source == window && event.data == messageName) {
			event.stopPropagation();
			if (timeouts.length > 0) {
				var fn = timeouts.shift();
				fn();
			}
		}
	}

	window.addEventListener("message", handleMessage, true);

	window.setZeroTimeout = setZeroTimeout;
})();

var loadImages = function(sources, callback){
	var nb = 0;
	var loaded = 0;
	var imgs = {};
	for(var i in sources){
		nb++;
		imgs[i] = new Image();
		imgs[i].src = sources[i];
		imgs[i].onload = function(){
			loaded++;
			if(loaded == nb){
				callback(imgs);
			}
		}
	}
}

let FPS = 90;
let game = null;
let canvas = null;
let images = {};
let colors = {
  cannon: "red",
  bullet: "black",
  surface: "green",
  rock: [
    "#264b96",
    "#27b376",
    "#006f3c",
    "#f9a73e",
    "#bf212f",
  ]
}
const OBJECT_CIRCLE = 0;
const OBJECT_RECT = 1;
let speed = function(fps) {
  FPS = parseInt(fps);
}

class GameObject {
  constructor(objectType, center, velocity, acceleration, color, image = undefined) {
    this.center = center.slice(0);
    this.velocity = velocity;
    this.acceleration = acceleration;
    this.type = objectType;
    this.color = color;
    this.image = image;

    // Define Vector Helper functions.
    this.vecSub = (x, y) => [x[0] - y[0], x[1] - y[1]];
    this.vecDot = (x, y) => x[0]*y[0] + x[1]*y[1];
    this.vecSlope = (x, y) => (y[1] - x[1])/(y[0] - x[0]);
    this.rotatePoint = function(point, angle) {
      return [
        point[0] * Math.cos(angle) - point[1] * Math.sin(angle),
        point[0] * Math.sin(angle) + point[1] * Math.cos(angle)
      ];
    };
    this.ptDist = (x, y) => Math.pow(
      Math.pow(x[0] - y[0], 2) + Math.pow(x[1] - y[1], 2),
      0.5
    );
  }

  update() {
    this.velocity[0] += this.acceleration[0];
    this.velocity[1] += this.acceleration[1];
    this.center[0] += this.velocity[0];
    this.center[1] += this.velocity[1];
  }
}

class Circle extends GameObject {
  constructor(center, radius, velocity, acceleration, strength, color, image = undefined) {
    super(OBJECT_CIRCLE, center, velocity, acceleration, color);
    this.radius = radius;
    this.strength = strength;
    this.originalStrength = strength;
  }

  isCollideWithObject(object, objectType) {
    if(objectType == OBJECT_RECT) {
      return this.isCollideWithRect(rect);
    } else if (objectType == OBJECT_CIRCLE) {
      return this.isCollideWithCircle(circle);
    } else {
      console.log("Invalid Object Type, Returning False");
      return false;
    }
  }

  isCollideWithRect(rect) {
    // Axis Align the Rectangle.
    let circleCenterAligned = this.vecSub(this.center, rect.center);

    let circleDistanceX = Math.abs(circleCenterAligned[0]);
    let circleDistanceY = Math.abs(circleCenterAligned[1]);

    if(circleDistanceX > (rect.dimensions[0]/2 + this.radius)) {
      return false;
    }
    if(circleDistanceY > (rect.dimensions[1]/2 + this.radius)) {
      return false;
    }

    if(circleDistanceX <= rect.dimensions[0]/2) {
      return true;
    }

    if(circleDistanceY <= rect.dimensions[1]/2) {
      return true;
    }

    let cornerDistanceSq = Math.pow(circleDistanceX - rect.dimensions[0]/2, 2) -
                        Math.pow(circleDistanceY - rect.dimensions[1]/2, 2);
    return (cornerDistanceSq <= Math.pow(this.radius, 2));
  }

  isCollideWithCircle(circle) {
    if(this.ptDist(this.center, circle.center) <= (this.radius + circle.radius)) {
      return true;
    } else {
      return false;
    }
  }

  isOut() {
    if(this.strength <= 0) {
      return true;
    } else {
      return false;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.translate(...this.center);
    ctx.arc(0, 0, this.radius, 0, 2*Math.PI);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.restore();
  }

  drawStrength(ctx) {
    ctx.save();
    ctx.fillStyle = "black";
    ctx.font="20px Oswald, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(this.strength, ...this.center);
    ctx.restore();
  }
}

class Rect extends GameObject {
  constructor(center, dimensions, color, image = undefined) {
    super(OBJECT_RECT, center, [0, 0], [0, 0], color, image);
    this.dimensions = dimensions;
  }
  returnDrawingCoordinates() {
    return [- Math.round(this.dimensions[0] / 2),
            - Math.round(this.dimensions[1] / 2),
            this.dimensions[0],
            this.dimensions[1]];
  }
  draw(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.translate(...this.center);
    ctx.fillStyle = this.color;
    ctx.fillRect(...this.returnDrawingCoordinates());
    ctx.restore();
  }
}

class Game {
  constructor(canvas, images, colors) {
    let self = this;
    document.addEventListener("keydown", function(e) { self.setDirection(e, self) }, true);
    document.addEventListener("keyup", function(e) { self.stopMotion(e, self) }, true);

    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.images = images;
    this.colors = colors;

    this.rocks = [];
    this.bullets = [];
    this.cannon = undefined;
    this.surface = undefined;
    this.background = this.images.background;


    this.levelFactor = 0;
    this.levelScore = 200;

    this.minRockStrength = 50;
    this.rockRadius = Math.round(this.width/10);
    this.maxRockVelocity = [1, 1];
    this.gravity = 0.02;

    this.bulletRadius = 3;
    this.bulletVelocity = [0, -3];
    this.bulletStrength = 2;
    this.bulletAcceleration = [0, 0];

    this.score = 0;
    this.interval = 0;
    this.rockSpawnInterval = 270;
    this.bulletSpawnInterval = 5;
  }

  start() {
    this.score = 0;
    this.interval = 0;
    this.levelFactor = 0;

    this.surface = new Rect(
      [Math.round(this.width/2), Math.round(this.height*(11/12))],
      [this.width, Math.round(this.height*(1/6))],
      this.colors.bg,
      this.images.bg
    );

    this.cannon = new Rect(
      [Math.round(this.width/2), Math.round(this.height*(5/6))],
      [Math.round(this.width/6), Math.round(this.height/18)],
      this.colors.cannon,
      this.images.cannon
    );
    this.rocks = [];
    this.bullets = [];
  }

  checkCollisions() {
    // Update Bullets
    for(let i = 0; i < this.bullets.length; i++) {
      this.bullets[i].update();
      if(this.bullets[i].center[1] < 0 || this.bullets[i].isOut()) {
        this.bullets.splice(i, 1);
      }
    }

    // Check Collisions
    for(let i = 0; i < this.rocks.length; i++) {
      this.rocks[i].update();

      // Rock and bullets
      for(let b = 0; b < this.bullets.length; b++) {
        if(this.rocks[i].isCollideWithCircle(this.bullets[b])) {
          this.rocks[i].strength -= this.bullets[b].strength;
          this.score += this.bullets[b].strength;
          this.bullets.splice(b, 1);
        }
      }

      // Check if Rock is Out
      if(this.rocks[i].isOut()) {
        if(
          this.rocks[i].originalStrength >= this.minRockStrength*Math.pow(2, this.levelFactor - 3) &&
          this.rocks[i].originalStrength >= 2*this.minRockStrength
        ) {
          this.rocks.push(
            // center, radius, velocity, acceleration, strength, color, image
            new Circle(
              [
                this.rocks[i].center[0] - Math.round(this.rocks[i].radius/1.4),
                this.rocks[i].center[1]
              ],
              Math.round(this.rocks[i].radius/1.4),
              [
                - this.rocks[i].velocity[0],
                - Math.abs(this.rocks[i].velocity[1])
              ],
              this.rocks[i].acceleration,
              Math.round(this.rocks[i].originalStrength/2),
              this.rocks[i].color,
              this.rocks[i].image
            ),
            new Circle(
              [
                this.rocks[i].center[0] + Math.round(this.rocks[i].radius/1.4),
                this.rocks[i].center[1]
              ],
              Math.round(this.rocks[i].radius/1.4),
              [
                this.rocks[i].velocity[0],
                - Math.abs(this.rocks[i].velocity[1])
              ],
              this.rocks[i].acceleration,
              Math.round(this.rocks[i].originalStrength/2),
              this.rocks[i].color,
              this.rocks[i].image
            ),
          );
        }
        this.rocks.splice(i, 1);
        continue;
      }

      // Rock and Cannon
      if(this.rocks[i].isCollideWithRect(this.cannon)) {
        this.start();
        break;
      }

      // Rock and top and bottom surface
      if(
        this.rocks[i].isCollideWithRect(this.surface) ||
        this.rocks[i].center[1] - this.rocks[i].radius < 0
      ) {
        this.rocks[i].velocity[1] = -this.rocks[i].velocity[1];
      }

      // Rock and sides of canvas
      if(
        this.rocks[i].center[0] - this.rocks[i].radius < 0 ||
        this.rocks[i].center[0] + this.rocks[i].radius > this.width
      ) {
        this.rocks[i].velocity[0] = -this.rocks[i].velocity[0];
      }
    }

    // Check if cannon collided with sides
    if(this.cannon.center[0] - this.cannon.dimensions[0]/2 < 0) {
      this.cannon.center[0] = Math.round(this.cannon.dimensions[0]/2);
    }
    if(this.cannon.center[0] + this.cannon.dimensions[0]/2 > this.width) {
      this.cannon.center[0] = this.width - Math.round(this.cannon.dimensions[0]/2);
    }
  }

  createRock() {
    if(Math.random() > 0.5) {
      // Left Rock
      this.rocks.push(
        // center, radius, velocity, acceleration, strength, color, image
        new Circle(
          [
            this.rockRadius,
            Math.round(Math.random()*(this.width/2 - this.rockRadius)) + this.rockRadius
          ],
          this.rockRadius,
          [
            (0.5 + Math.random()/2)*this.maxRockVelocity[0],
            (2*Math.random() - 1)*this.maxRockVelocity[1]
          ],
          [
            0,
            this.gravity
          ],
          this.minRockStrength*Math.pow(2, this.levelFactor),
          this.colors.rock[Math.floor(Math.random() * this.colors.rock.length)],
          this.images.rock
        )
      );
    } else {
      // Right Rock
      this.rocks.push(
        // center, radius, velocity, acceleration, strength, color, image
        new Circle(
          [
            this.width - this.rockRadius,
            Math.round(Math.random()*(this.width/2 - this.rockRadius)) + this.rockRadius
          ],
          this.rockRadius,
          [
            - (0.5 + Math.random()/2)*this.maxRockVelocity[0],
            (2*Math.random() - 1)*this.maxRockVelocity[1]
          ],
          [
            0,
            this.gravity
          ],
          this.minRockStrength*Math.pow(2, this.levelFactor),
          this.colors.rock[Math.floor(Math.random() * this.colors.rock.length)],
          this.images.rock
        )
      );
    }
  }

  createBullet() {
    this.bullets.push(
      // center, radius, velocity, acceleration, strength, color, image
      new Circle(
        [
          this.cannon.center[0] + Math.round(this.cannon.dimensions[0]/4),
          this.cannon.center[1] - Math.round(this.cannon.dimensions[1]/2),
        ],
        this.bulletRadius,
        this.bulletVelocity,
        this.bulletAcceleration,
        this.bulletStrength*Math.pow(2, this.levelFactor),
        this.colors.bullet,
        this.images.bullet
      ),
      new Circle(
        [
          this.cannon.center[0] - Math.round(this.cannon.dimensions[0]/4),
          this.cannon.center[1] - Math.round(this.cannon.dimensions[1]/2),
        ],
        this.bulletRadius,
        this.bulletVelocity,
        this.bulletAcceleration,
        this.bulletStrength*Math.pow(2, this.levelFactor),
        this.colors.bullet,
        this.images.bullet
      ),
    );
  }

  update() {
    this.cannon.update();
    this.checkCollisions()

    this.interval++;
    if(this.interval % this.bulletSpawnInterval == 0) {
      this.createBullet();
    }

    if(this.interval == this.rockSpawnInterval) {
      this.createRock();
      this.interval = 0;
    }

    if(this.score == this.levelScore*Math.pow(2, this.levelFactor)) {
      this.levelFactor++;
    };

    let self = this;
    if(FPS == 0){
      setZeroTimeout(function(){
        self.update();
      });
    } else {
      setTimeout(function(){
        self.update();
      }, 1000/FPS);
    }
  }

  display() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    this.surface.draw(this.ctx);

    this.cannon.draw(this.ctx);

    for(let rock of this.rocks) {
      rock.draw(this.ctx);
      rock.drawStrength(this.ctx);
    }

    for(let bullet of this.bullets) {
      bullet.draw(this.ctx);
    }

    this.ctx.save();
    this.ctx.fillStyle = "black";
    this.ctx.fillText("Score : "+ this.score, 10, 25);
    this.ctx.restore();

    let self = this;
    requestAnimationFrame(function(){
      self.display();
    });
  }

  setDirection(e, self) {
    if(e.keyCode == 37) {
      self.cannon.velocity = [-2, 0];
    }
    if(e.keyCode == 39) {
      self.cannon.velocity = [2, 0];
    }
  }

  stopMotion(e, self) {
    if(e.keyCode == 37 || e.keyCode == 39) {
      self.cannon.velocity = [0, 0];
    }
  }
}

window.onload = function() {
  canvas = document.querySelector("#game");
  game = new Game(canvas, images, colors);
  game.start();
  game.update();
  game.display();
}
