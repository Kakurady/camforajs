// -*- indent-tabs-mode:nil; tab-width: 2; -*- 
function camfora(){
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
  
  // this should go into the ui module
  var needResizeCanvas = false;
  var needResetStartTime = false;
  
  var animationFrameScheduled = true;
  
  var maxPoints = 25;
  
  
  var svgRenderer = (function makeSVGRenderer( options ){
    var rootElement;
    var wrapper;
    // our canvas element. a d3 selection containing one (1) svg element
    var s;
    // container group for all our drawings. 
    var plot;
    // number of robots initially present, for assigning colors
    // FIXME: if starts out paused, should't count
    var n = 0;
    var color = vec3.create();
    
    var zoom;
    var xScale;
    var yScale;
    var xAxis;
    var yAxis;
    var xAxisGroup;
    var yAxisGroup;
    var zoomTranslation = vec3.create();

    var canvasWidth = 800;
    var canvasHeight = 480;    
    var plotWidth = canvasWidth;
    var plotHeight = canvasHeight;
    
    var trailData = [];

    
    function onResize(){
      needResizeCanvas = true;
      if (!animationFrameScheduled) {
        window.requestAnimationFrame(drawNextFrame);
      }
    }
    // private 
    function resizeCanvas(){
        canvasWidth = wrapper.property("clientWidth");
        canvasHeight = wrapper.property("clientHeight");
        plotWidth = canvasWidth - 5;
        plotHeight = canvasHeight - 5;
        
        s.attr("width", plotWidth);
        s.attr("height", plotHeight);
        xAxisGroup.attr("transform", "translate(0 "+ (plotHeight - 25 - 0.5) +")");
        yAxisGroup.attr("transform", "translate("+ ( 50 - 0.5)  +" 0)");
        
        zoom.size(plotWidth, plotHeight);
        var oldScale = zoom.scale();
        var oldTranslate = zoom.translate();
        xScale.domain([ 0, plotWidth ]);
        xScale.range([0, plotWidth]);
        yScale.domain([0, plotHeight]);
        yScale.range([0, plotHeight]);
        xAxis.innerTickSize(-plotHeight);
        yAxis.innerTickSize(-plotWidth);
        zoom.x(xScale);
        zoom.y(yScale);
        zoom.scale(oldScale);
        zoom.translate(oldTranslate);
        zoom.event(s);
    }
    
    function init(){
    
    
      wrapper = d3.select("#wrapper").insert("div");
      wrapper.classed("camfora-wrapper", true);
      s = wrapper.insert("svg");
      s.attr("width", plotWidth);
      s.attr("height", plotHeight);
      s.classed("camfora-plot", true);
      
      d3.select(document.defaultView).on("resize.resizeCanvas", onResize);
      
      // fixme: default is 6px + 0.71em
      xAxisGroup = s.insert("g")
        .attr("class", "axis x-axis")
        .attr("id", "x-axis").attr("transform", "translate(0 "+ (480 - 25 - 0.5) +")");
      yAxisGroup = s.insert("g")
        .attr("class", "axis y-axis")
        .attr("id", "y-axis").attr("transform", "translate("+ ( 50 - 0.5)  +" 0)");
      plot = s.insert("g").attr("id", "plot");
      
      xScale = d3.scale.linear()
        .domain([0, 800])
        .range([0, 800]);
      yScale = d3.scale.linear()
        .domain([0, 480])
        .range([0, 480]);
      
      xAxis = d3.svg.axis()
        .scale(xScale)
        .orient("bottom");
      xAxisGroup.call(xAxis);
      
      yAxis = d3.svg.axis()
        .scale(yScale)
        .orient("left");
      yAxisGroup.call(yAxis);
    
      zoom = d3.behavior.zoom()
        .x(xScale)
        .y(yScale);
      s.call(zoom);
      
      zoom.on("zoom", function onZoom(){
        var e = d3.event;
        plot.attr("transform", "translate("+ e.translate[0] +" "+ e.translate[1] + ") scale("+ e.scale + ")");
        xAxisGroup.call(xAxis);
        yAxisGroup.call(yAxis);
      });
      resizeCanvas();
    }
  
    function tog(out, t){
      out[0] = ( Math.cos(  t * 2 * Math.PI) + 1 ) / 2;
      out[1] = ( Math.cos( (t * 2 + 2 / 3) * Math.PI ) + 1 ) / 2;
      out[2] = ( Math.cos( (t * 2 + 4 / 3) * Math.PI ) + 1 ) / 2;
    }
  
    function paintColor(d, i){
      if (i < n){
        tog(color, i / ( n + 2) );
      } else {
        var k = Math.floor(i/n);
        var num = ( 2 * k + 1);
        var dem = Math.pow(2, Math.ceil( Math.log(k + 1) / Math.LN2 ));
        var added = ( num / dem ) % 1;
        tog(color, (i % n + added) / ( n + 2) );
      }
      vec3.scale( color, color, 100);
      
      return [
        "color:rgb( ", 
        Math.round(color[0]), "%,", 
        Math.round(color[1]), "%,",
        Math.round(color[2]), "% )"
        ].join("");
    }
    
    // FIXME produce trails that are relative to the center
    function buildPathAttr(d, i){
      var stringBuf = "";
      var j = 0;
      stringBuf = stringBuf + "M" + d[j].endPos[0].toString() + " " + d[j].endPos[1].toString();
      for (j = 1; j < d.length; j++){
        stringBuf = stringBuf + "L" + d[j].endPos[0].toString() + " " + d[j].endPos[1].toString();
      }
      return stringBuf;
    }
    
    function returnNewArray(){ return []; }
  
    function renderGraphics(data){
      // FIXME perf: creating functions like candy here. They all have to be GC'ed.
      var i = 0;
      var j = 0;
      var robot;
      var trailEntry;

      if (needResizeCanvas){
        resizeCanvas();
        needResizeCanvas = false;
      }
      
      // drawing leaders.
      var leader_update = plot.selectAll("circle.leader").data(data.leaders);

      leader_update.enter()
        .append("circle")
        .classed("leader", true)
        .attr("id", function (d, i) { return "leader-"+i; })
        .attr("r", 15);
      leader_update
        .attr("cx", function(d) { return d.pos[0]; })
        .attr("cy", function(d) { return d.pos[1]; });
      leader_update.exit().remove();
      
      // drawing robots.
      var robot_update = plot.selectAll("circle.robot").data(data.robots);
      n = n || data.robots.length;

      robot_update.enter()
        .append("circle")
        .classed("robot", true)
        .attr("id", function (d, i) { return "robot-"+i; })
        .attr("r", 10)        
        .attr("style", paintColor);
      robot_update
        .attr("cx", function(d) { return d.pos[0]; })
        .attr("cy", function(d) { return d.pos[1]; });
      robot_update.exit().remove();
      
      // drawing goals.
      var goal_update = plot.selectAll("circle.goal").data(data.robots);
      
      goal_update.enter()
        .append("circle")
        .classed("goal", true)
        .attr("id", function (d, i) { return "goal-"+i;  })
        .attr("r", 3)
        .attr("style", paintColor);
      goal_update
        .attr("cx", function(d) { return d.goal[0]; })
        .attr("cy", function(d) { return d.goal[1]; });
      goal_update.exit().remove();
      
      //  drawing trails. 
      //  update trail array-of-array.
      setArrayLength(trailData, robots.length, returnNewArray);
      for(i = 0; i < robots.length; i++){
        robot = robots[i];
        j = 0;
        while (j < robot.trail.length){
      //  in each subarray
      //    do:
      //      see if array is too short for next element
          if( j >= trailData[i].length) {
      //        if yes, add new element
            trailData[i].push({ endPos: vec3.create(), endTime: 0 });
          }
      //      calculate new element
          trailEntry = trailData[i][j];
          trailEntry.endTime = robot.trail[j].endTime;
          vec3.copy(trailEntry.endPos, robot.trail[j].endPos);          
          j++;
      //    until no more element needed
          
        }
        trailData[i].length = robot.trail.length;
      //    trim subarray to size.
      }
      
      var trail_update = plot.selectAll("path.trail").data(trailData);
      trail_update.enter()
        .append("path")
        .classed("trail", true)
        .attr("id", function (d, i) { return "trail-"+i; })
        .attr("style", paintColor);
      trail_update
        .attr("d", buildPathAttr);
      trail_update.exit().remove();

      
      // focus camera on leader.
      // FIXME: something about disabling panning
      if (data.leaders[0]){
        vec3.negate(zoomTranslation, data.leaders[0].pos);
        vec3.scale(zoomTranslation, zoomTranslation, zoom.scale());
        zoomTranslation[0] += plotWidth / 2;
        zoomTranslation[1] += plotHeight / 2;
        zoom.translate(zoomTranslation);
        
        zoom.event(s);
      }
    }
    
    return {
      addRobot: function addRobot(){},
      attachedElement: s,
      init: init,
      renderGraphics: renderGraphics
    };
  })( rendererOptions );
  
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
  /// Algorithm from Gervasi, Vincenzo and Prencipe, Giuseppe. "On the Efficient Capture of Dangerous Criminals". Third International Conference on \_ FUN with Algorithms, 2004.
  // This algorithm isn't tweaked for perf.
  function moveRobotGervasi2004(self, goal, leaders, robots, sensor, scratchpad){
    var l1 = 50;
    var E = vec3.create(); vec2.sub(E, leaders[0].pos, self.pos);
  
    var l = vec2.length(E);
    var target = vec3.create(); vec3.scale(target, E, (l - l1) /l );
    
    var cord = 2 * l1 * Math.sin( Math.PI / robots.length );
    
    var ri = vec3.create();
    for (var i = 0; i < robots.length; i++){
      var robot = robots[i];
      if ( !robot.isSelf){
        // you'd want to declare ri here, but this is a bad idea
        // you're creating O( n^2 * t ) objects to be garbage collected
        
        vec2.sub(ri, robot.pos, self.pos);
        var l_p = vec2.length( ri );
        if ( l_p < cord ){
          vec2.scaleAndAdd( target, target, ri, ( l_p - cord ) / Math.max(l_p, 0.1) );
        }
      }
    }
    
    vec3.add(target, target, self.pos);
    return target;
  }
 

  function init(){
  // FIXME HACK making sure the leader starts at its position (need better method for robots)
  vec3.copy (leaders[0].movement.endPos, leaders[0].pos);
  
    renderer = svgRenderer;
    moveRobots = moveRobotGervasi2004;
    
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
  
  function setArrayLength(to, targetLength, newFunc){
    var j;
    
    // trim to array if it's too long
    if (targetLength < to.length) {
      to.length = targetLength;
    }
    // add new entries if it's too short
    for (j = to.length; j < targetLength; j++){
      to.push( newFunc(j) );
    }
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
        
        vec3.copy(robot.movement.startPos, robot.pos);
        robot.movement.startTime = simulationTime;
        
        vec3.copy(robot.movement.endPos, robot.goal);
        vec3.sub(howfar, robot.pos, robot.goal);
        var duration = vec3.length(howfar) / robot.speed;
        robot.movement.endTime = robot.movement.startTime + duration;
        
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
    
    // extract state for rendering
    renderData.leaders = leaders;
    renderData.robots = robots;
    renderData.simulationTime = simulationTime;
    
    // render simulation and visualization
    renderer.renderGraphics( renderData );
  }
  
  init();
  // FIXME: requestAnimationFrame won't work in IE9.
  // Whether we need to support China needs to be thought 
  window.requestAnimationFrame (drawNextFrame);  
}

export default camfora;
