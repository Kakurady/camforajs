// -*- indent-tabs-mode:nil; tab-width: 2; -*- 
import {setArrayLength} from "./util";

function tog(out, t){
  out[0] = ( Math.cos(  t * 2 * Math.PI) + 1 ) / 2;
  out[1] = ( Math.cos( (t * 2 + 2 / 3) * Math.PI ) + 1 ) / 2;
  out[2] = ( Math.cos( (t * 2 + 4 / 3) * Math.PI ) + 1 ) / 2;
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

function makeSVGRenderer( options ){
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

    // this should go into the ui module
    var needResizeCanvas = false;
    var needResetStartTime = false;
    
    // callback when containing element is resized; schedules resizing.
    function onResize(){
      needResizeCanvas = true;
      // TODO have the render call into the core
      //if (!animationFrameScheduled) {
      //  window.requestAnimationFrame(drawNextFrame);
      //}
    }
    // private 
    // actually does the resizing. avoids running code multiple times in a frame.
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
    
    // this function needs a reference to n.
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
      setArrayLength(trailData, data.robots.length, returnNewArray);
      for(i = 0; i < data.robots.length; i++){
        robot = data.robots[i];
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
  }
  
export default makeSVGRenderer;
