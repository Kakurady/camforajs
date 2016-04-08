// -*- indent-tabs-mode:nil; tab-width: 2; -*- 
import svgRenderer from "./svgRenderer";
import {setArrayLength} from "./util";



function camfora(options){
  /// list of leader (human-controlled) robots (usually only one).
  var leaders = [
    { 
      // question: 2-axis, 3-axis, or homogenous coordinates?
      pos: vec3.fromValues(0, 0, 0),
      /// max movement speed, in pixels per second.
      speed:  200,
      
      // currently assuming zero turning radius... zero minimum movement distance
      // implementation-specific? ( will need to be rebuilt for robots )
      movement: {
        startPos: vec3.create(),
        startTime: -1,
        endPos: vec3.create(),
        endTime: 0
      }
    }
  ];
  
  var robots = [];
  
  /// elapsed time in simulation (in seconds)
  var simulationTime = 0;
  /// when running in real time, the epoch from when the simulation time is counted.
  /// (scheduler private variable; may change due to pausing simulations)
  var startTime;
  
  /// data passed to renderer. May not countain all data from source.
  /// (core private variable, cached to minimize GC)
  var renderData = {
    leaders: leaders,
    robots: robots
  };
  
  var rendererOptions = {};
  var renderer;
  
  var moveRobots;
  
  var maxPoints = 25;
  
  function addRobot( options ){
    var newRobot = {
      pos: vec3.create(),
      speed: 250,
      movement: {
        startPos: vec3.create(),
        startTime: simulationTime-1,
        endPos: vec3.create(),
        endTime: simulationTime
      },
      goal: vec3.create(),
      sensed: { leaders: [], robots: [] },
      scratchpad: {},
      trail: []
    };
    if (options && options.pos){
      vec3.copy(newRobot.pos, options.pos);
    } else {
      vec3.copy(newRobot.pos, leaders[0].pos);
      
      var radius = Math.random() * 200 + 200;
      var theta = Math.random() * Math.PI * 2;
      
      newRobot.pos[0] += Math.cos(theta) * radius;
      newRobot.pos[1] += Math.sin(theta) * radius;
    }
    
    vec3.copy(newRobot.movement.startPos, newRobot.pos);
    vec3.copy(newRobot.movement.endPos, newRobot.pos);
    
    newRobot.trail.push({
      endPos: vec3.clone(newRobot.movement.endPos),
      endTime: newRobot.movement.endTime
    });
    
    robots.push(newRobot);
    renderer.addRobot(newRobot);
  }
  
  function moveLeader(simulationTime){
    var leader = leaders[0];
    
    // every frame: interpolate current position
    // (  the idea is that we pretend computations happens in an instant,
    //    that is, at the current `simulationTime`.
    //    and movements happen over an interval, that is, between the last
    //    `simulationTime` and the current `simulationTime`. (this is called a
    //    _frame_ when running in realtime, as used in video games, because
    //    each update result in one image being displayed.)
    //    so the position calculation is used to "catch up" the simulation
    //    to the instant when computations happen.
    //    this way, when a robot finishes its _MOVE_ phrase, it can begin
    //    the _LOOK_ and _COMPUTE_ phrase in the same frame, making a smoother-
    //    looking simulation.
    //
    //    if we run the position update after the computation, then a robot that
    //    finished _MOVE_ment between instants `t-1` and `t` would not start its
    //    _COMPUTE_ phrase until `t+1`.
    //    it's possible to get around this by making the animation start time
    //    before the compute instant, but this effectively makes robots being
    //    able to see into the future.
    //  )
    vec3.lerp(
      leader.pos, 
      leader.movement.startPos, 
      leader.movement.endPos, 
      Math.min(1, (simulationTime - leader.movement.startTime) / (leader.movement.endTime - leader.movement.startTime) )
      );
    
    if (simulationTime >= leader.movement.endTime){
      // FIXME perf: creates garbage that needs to be collected
      var offset = vec3.fromValues(0, 0, 0);
      var howfar = vec3.create();
      
      // set new start position and time
      
      vec3.copy(leader.movement.startPos, leader.pos);
      leader.movement.startTime = simulationTime;
      
      // set new end position and time
      
      vec2.random(leader.movement.endPos, 400);
      vec3.add(leader.movement.endPos, leader.movement.endPos, offset);
      // figure out the animation end time
      vec3.sub(howfar, leader.pos, leader.movement.endPos);
      var duration = vec2.length(howfar) / leader.speed;
      // set a random speed
      duration = duration * ( 0.5 + Math.random(0.5) );
      leader.movement.endTime = leader.movement.startTime + duration;
    }
    

  }

  function init(options){
  // FIXME HACK making sure the leader starts at its position (need better method for robots)
  vec3.copy (leaders[0].movement.endPos, leaders[0].pos);
  
    if (options && options.algorithm) {
      setRobotAlgorithm (options.algorithm);
    }
    renderer = svgRenderer();
    
    renderer.init();
    
    var numRobots = Math.ceil( 2 + Math.random()*5 );
    var i;
    for (i = 0; i < numRobots; i++){
      addRobot();
    }
    
    d3.select("#add-robot-button").attr("disabled", null)
      .on("click", function(){
        addRobot();
      });
      
    
  }
  
  function drawNextFrame(timestamp){
  //https://developer.mozilla.org/en-US/docs/Games/Anatomy
    var i; var j;
    // FIXME perf 
    var howfar = vec3.create();
    var robot;
  
    window.requestAnimationFrame(drawNextFrame);
    
    startTime = startTime || timestamp;
    simulationTime = (timestamp - startTime) / 1000;
    
    // TODO: poll manual leader movement (gamepad/mouse)
    
    // update robots
    moveLeader(simulationTime);
    for (i = 0; i < robots.length; i++){
      // TODO could be using `let` here
      robot = robots[i];
      vec3.lerp(
        robot.pos, 
        robot.movement.startPos, 
        robot.movement.endPos, 
        Math.min(1, (simulationTime - robot.movement.startTime) / (robot.movement.endTime - robot.movement.startTime) )
      );
    }
    
    // run computations
    for (i = 0; i < robots.length; i++){
      // TODO could be using `let` here
      robot = robots[i];
      var self;
      // 1. find robots that need computations run
      if (simulationTime >= robot.movement.endTime){
        // 2. gather state and run sensing filters/plugins
        // FIXME perf: creates temporary objects
        var sensed = robot.sensed;
        
        // update items
        // truncate the array if it's too long
        if (leaders.length < sensed.leaders.length) {
          sensed.leaders.length = leaders.length;
        }
        // add new items if it's too short
        for (j = sensed.leaders.length; j < leaders.length; j++){
          sensed.leaders.push({
            pos: vec3.create()
          });
          // TODO hook: init coordinate transformation
        }
        for (j = 0; j < leaders.length; j++) {
          vec3.copy(sensed.leaders[j].pos, leaders[j].pos);
          // TODO hook: apply coordinate transformation
        }
        
        if (robots.length < sensed.robots.length) {
          sensed.robots.length = robots.length;
        }
        // add new items if it's too short
        for (j = sensed.robots.length; j < robots.length; j++){
          sensed.robots.push({
            pos: vec3.create(),
            isSelf : false
          });
        }
        for (j = 0; j < robots.length; j++) {
          vec3.copy(sensed.robots[j].pos, robots[j].pos);
          sensed.robots[j].isSelf = (i == j);
          
          if (i == j) { self = sensed.robots[j]; }
        }
        // 3. run algorithm
        // ( instead of passing self, I could invoke the method on the `self` object so it becomes `this` )
        // FIXME handle returning different dimensions
        // FIXME perf: creates garbage for GC to clean up 
        robot.goal = moveRobots(self, robot.goal, sensed.leaders, sensed.robots, sensed, robot.scratchpad);
      
        // 4. update result
        // set new start position and time
        
        robot.movement.startTime = simulationTime;
        vec3.sub(howfar, robot.pos, robot.goal);
        var duration = vec3.length(howfar) / robot.speed;
        // cap duration
        var MAX_DURATION = 0.1;
        if (duration > MAX_DURATION){
          var scaler = MAX_DURATION / duration;
          vec3.copy(robot.movement.startPos, robot.pos);
          vec3.lerp(robot.movement.endPos, robot.pos, robot.goal, scaler);
          robot.movement.endTime = robot.movement.startTime + MAX_DURATION;
        } else {
          vec3.copy(robot.movement.startPos, robot.pos);
          vec3.copy(robot.movement.endPos, robot.goal);
          robot.movement.endTime = robot.movement.startTime + duration;
        }
        
        robot.trail.push({
          endTime: robot.movement.endTime,
          endPos:  vec3.clone(robot.movement.endPos)
        });
        while (robot.trail.length > maxPoints){
          robot.trail.shift();
        }
        
      
        // TODO hook: if robot is disabled, don't move it
      }
    }
    
    if (renderer){
      // extract state for rendering
      renderData.leaders = leaders;
      renderData.robots = robots;
      renderData.simulationTime = simulationTime;
      
      // render simulation and visualization
      renderer.renderGraphics( renderData );
    }
  }
  
  function start(){
  
    // FIXME: requestAnimationFrame won't work in IE9.
    // Whether we need to support China needs to be thought 
    window.requestAnimationFrame (drawNextFrame);  
  }
  
  function setRobotAlgorithm(fn){
    moveRobots = fn;
  }
  
  init(options);
  return {
    init: init,
    start: start
  }
}

export default camfora;
