function makeUI(camfora, options){
    //FIXME: adapt this for multiple simulations.
    //FIXME: when is the camfora API available?
    var container;


    function init(){
      container = d3.select("#sidebar").insert("div");
      container.classed("camfora-sidebar", true);
      
    }
    function updateUI(data){
        var picker_section = container;
        var picker_update = picker_section.selectAll("label.picker").data(data.robots);
        
        picker_update.enter()
            .append("label")
            .classed("picker", true)
            .text( function(d, i){ return i; } )
            .insert("input", "*")
            .attr("type", "checkbox")
            .attr("name", function(d, i){ return i; });
        picker_update.exit().remove();
    }
    
    function find_checked(){
        return d3
            .selectAll("label.picker>input")[0]
            .filter(function (x){return x.checked;})
            .map(function(x){return parseInt(x.name);});
    }
    function fob(){
        console.log(find_checked());
    }
    function setFault(){
        camfora.setFault(find_checked());
    }
    function clearFault(){
        camfora.clearFault(find_checked());
    }
    
    init (options);
    return {
        addRobot: function addRobot(){},
        updateUI: updateUI,
        fob: fob,
        setFault: setFault,
        clearFault: clearFault
    };
}
export default makeUI;
